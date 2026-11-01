use super::*;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};

const ROOM: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SELF: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const PEER: &str = "cccccccccccccccccccccccccccccccc";
const TOKEN: &str = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";

struct Request {
    path: String,
    body: Value,
    authorization: Option<String>,
}
struct Step {
    status: u16,
    body: Value,
    gate: Option<oneshot::Receiver<()>>,
}

fn step(status: u16, body: Value) -> Step {
    Step {
        status,
        body,
        gate: None,
    }
}

async fn server(steps: Vec<Step>) -> (String, mpsc::Receiver<Request>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let (tx, rx) = mpsc::channel(16);
    tokio::spawn(async move {
        for step in steps {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            let (header_end, content_len) = loop {
                let read = stream.read(&mut buffer).await.unwrap();
                assert!(read > 0, "request closed before headers");
                bytes.extend_from_slice(&buffer[..read]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8(bytes[..end].to_vec()).unwrap();
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    break (end + 4, length);
                }
                assert!(bytes.len() < 65_536);
            };
            while bytes.len() < header_end + content_len {
                let read = stream.read(&mut buffer).await.unwrap();
                assert!(read > 0, "request body closed early");
                bytes.extend_from_slice(&buffer[..read]);
            }
            let headers = String::from_utf8(bytes[..header_end].to_vec()).unwrap();
            let request = Request {
                path: headers
                    .lines()
                    .next()
                    .unwrap()
                    .split_whitespace()
                    .take(2)
                    .collect::<Vec<_>>()
                    .join(" "),
                authorization: headers.lines().find_map(|line| {
                    line.split_once(':')
                        .filter(|(name, _)| name.eq_ignore_ascii_case("authorization"))
                        .map(|(_, value)| value.trim().to_string())
                }),
                body: if content_len == 0 {
                    Value::Null
                } else {
                    serde_json::from_slice(&bytes[header_end..header_end + content_len]).unwrap()
                },
            };
            tx.send(request).await.unwrap();
            if let Some(gate) = step.gate {
                let _ = gate.await;
            }
            let body = if step.status == 204 {
                String::new()
            } else {
                step.body.to_string()
            };
            let response = format!("HTTP/1.1 {} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", step.status, body.len(), body);
            let _ = stream.write_all(response.as_bytes()).await;
        }
    });
    (origin, rx)
}

fn membership() -> Value {
    json!({"roomId":ROOM,"memberId":SELF,"memberToken":TOKEN,"ownerId":SELF,"invite":format!("GMP1.{ROOM}.{}", "e".repeat(64)),"expiresInMs":14_400_000})
}
fn snapshot() -> Value {
    json!({"roomId":ROOM,"selfId":SELF,"ownerId":SELF,"expiresInMs":14_399_000,"members":[
        {"memberId":SELF,"displayName":"เรา","isOwner":true,"state":"waiting","ageMs":null,"sample":null},
        {"memberId":PEER,"displayName":"เพื่อน","isOwner":false,"state":"live","ageMs":100,"sample":{
            "hero":"npc_dota_hero_mars","level":14,"hp":1200,"maxHp":2000,"manaPercent":50,"alive":true,"respawnSeconds":0}}
    ]})
}
fn waiting_snapshot() -> Value {
    let mut value = snapshot();
    for member in value["members"].as_array_mut().unwrap() {
        member["state"] = json!("waiting");
        member["ageMs"] = Value::Null;
        member["sample"] = Value::Null;
    }
    value
}
fn options(url: String) -> ConnectOptions {
    ConnectOptions {
        relay_url: url,
        display_name: "เรา".into(),
        invite: None,
        consent: true,
    }
}
fn local(client: &PartyClient) {
    client.observe_local(project_local(&super::tests::playing(), true), 7);
}

#[tokio::test]
async fn consent_is_required_before_opening_a_socket() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let client = PartyClient::new().unwrap();
    let mut request = options(format!("http://{}", listener.local_addr().unwrap()));
    request.consent = false;
    assert!(matches!(
        client.connect(request).await,
        Err("consent_required")
    ));
    assert!(
        tokio::time::timeout(Duration::from_millis(30), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn real_http_transport_sends_only_the_allowlist_and_hides_credentials_from_ipc() {
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(200, snapshot()),
        step(204, Value::Null),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    local(&client);
    let joined = client.connect(options(url)).await.unwrap();
    local(&client);
    assert_eq!(joined.status, PartyStatus::Connected);
    let create = requests.recv().await.unwrap();
    assert_eq!(create.path, "POST /v1/rooms");
    assert_eq!(create.body, json!({"displayName":"เรา"}));
    client.sync_once().await;
    let sync = requests.recv().await.unwrap();
    assert_eq!(sync.path, format!("POST /v1/rooms/{ROOM}/sync"));
    assert_eq!(
        sync.authorization.as_deref(),
        Some(format!("Bearer {TOKEN}").as_str())
    );
    assert_eq!(sync.body["sequence"], 1);
    assert_eq!(sync.body["sample"]["hp"], 780);
    assert_eq!(sync.body["scope"]["team"], "radiant");
    assert!(!sync.body.to_string().contains("76561198115363193"));
    let view = client.view();
    assert_eq!(view.members[1].sample.as_ref().unwrap().hp, 1200);
    assert!(!serde_json::to_string(&view).unwrap().contains(TOKEN));
    assert_eq!(client.leave().await.status, PartyStatus::Idle);
    assert_eq!(
        requests.recv().await.unwrap().path,
        format!("DELETE /v1/rooms/{ROOM}/members/me")
    );
    assert!(client.view().members.is_empty());
}

#[tokio::test]
async fn a_late_admission_after_leave_is_deleted_without_restoring_membership() {
    let (release_tx, release_rx) = oneshot::channel();
    let (url, mut requests) = server(vec![
        Step {
            status: 201,
            body: membership(),
            gate: Some(release_rx),
        },
        step(204, Value::Null),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    let joining = {
        let client = client.clone();
        tokio::spawn(async move { client.connect(options(url)).await })
    };
    tokio::time::timeout(Duration::from_millis(200), requests.recv())
        .await
        .expect("admission request must be sent")
        .unwrap();
    assert_eq!(client.leave().await.status, PartyStatus::Idle);
    release_tx.send(()).unwrap();
    assert!(matches!(joining.await.unwrap(), Err("cancelled")));
    assert_eq!(
        requests.recv().await.unwrap().path,
        format!("DELETE /v1/rooms/{ROOM}/members/me")
    );
    assert!(client.view().room_id.is_none());
}

#[tokio::test]
async fn changed_owner_or_match_discards_in_flight_peer_health() {
    let (release_tx, release_rx) = oneshot::channel();
    let (url, mut requests) = server(vec![
        step(201, membership()),
        Step {
            status: 200,
            body: snapshot(),
            gate: Some(release_rx),
        },
    ])
    .await;
    let client = PartyClient::new().unwrap();
    local(&client);
    client.connect(options(url)).await.unwrap();
    local(&client);
    requests.recv().await.unwrap();
    let syncing = {
        let client = client.clone();
        tokio::spawn(async move { client.sync_once().await })
    };
    requests.recv().await.unwrap();
    client.validate_source_context(Some("76561198115363194"), 7, true);
    release_tx.send(()).unwrap();
    syncing.await.unwrap();
    assert!(client.view().members.iter().all(|m| m.sample.is_none()));
}

#[tokio::test]
async fn concurrent_pollers_never_create_two_sync_requests() {
    let (release_tx, release_rx) = oneshot::channel();
    let (url, mut requests) = server(vec![
        step(201, membership()),
        Step {
            status: 200,
            body: snapshot(),
            gate: Some(release_rx),
        },
    ])
    .await;
    let client = PartyClient::new().unwrap();
    local(&client);
    client.connect(options(url)).await.unwrap();
    local(&client);
    requests.recv().await.unwrap();
    let first = {
        let client = client.clone();
        tokio::spawn(async move { client.sync_once().await })
    };
    requests.recv().await.unwrap();
    client.sync_once().await;
    assert!(requests.try_recv().is_err());
    release_tx.send(()).unwrap();
    first.await.unwrap();
}

#[tokio::test]
async fn transport_failure_requires_a_null_probe_before_more_vitals() {
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(503, json!({"error":"capacity"})),
        step(200, waiting_snapshot()),
        step(200, snapshot()),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    local(&client);
    client.connect(options(url)).await.unwrap();
    local(&client);
    requests.recv().await.unwrap();
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert_eq!(client.view().status, PartyStatus::Reconnecting);
    assert!(client.view().members.iter().all(|m| m.sample.is_none()));
    client.sync_once().await;
    let probe = requests.recv().await.unwrap();
    assert_eq!(probe.body, json!({"sequence":2,"scope":null,"sample":null}));
    client.sync_once().await;
    let resumed = requests.recv().await.unwrap();
    assert_eq!(resumed.body["sequence"], 3);
    assert_eq!(resumed.body["sample"]["hp"], 780);
}

#[tokio::test]
async fn revoked_membership_closes_without_automatic_rejoin() {
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(401, json!({"error":"unauthorized"})),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    local(&client);
    client.connect(options(url)).await.unwrap();
    local(&client);
    requests.recv().await.unwrap();
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert_eq!(client.view().status, PartyStatus::Closed);
    assert!(client.view().room_id.is_none());
    client.sync_once().await;
    assert!(client.view().members.is_empty());
}

#[tokio::test]
async fn owner_actions_are_authenticated_and_never_put_tokens_in_the_view() {
    let invitation = format!("GMP1.{ROOM}.{}", "f".repeat(64));
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(200, snapshot()),
        step(200, json!({"invite":invitation})),
        step(204, Value::Null),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    client.connect(options(url)).await.unwrap();
    requests.recv().await.unwrap();
    local(&client);
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert!(matches!(client.kick(SELF).await, Err("forbidden")));
    let rotated = client.rotate_invite().await.unwrap();
    assert_eq!(rotated.invite.as_deref(), Some(invitation.as_str()));
    let rotate = requests.recv().await.unwrap();
    assert_eq!(rotate.path, format!("POST /v1/rooms/{ROOM}/invite"));
    assert_eq!(rotate.body, json!({}));
    assert_eq!(
        rotate.authorization.as_deref(),
        Some(format!("Bearer {TOKEN}").as_str())
    );
    let kicked = client.kick(PEER).await.unwrap();
    assert!(kicked.members.iter().all(|m| m.member_id != PEER));
    assert_eq!(
        requests.recv().await.unwrap().path,
        format!("DELETE /v1/rooms/{ROOM}/members/{PEER}")
    );
    assert!(!serde_json::to_string(&kicked).unwrap().contains(TOKEN));
}

#[tokio::test]
async fn error_codes_distinguish_full_rooms_from_replayed_sequences_without_echoing_server_text() {
    let (url, _requests) = server(vec![step(409, json!({"error":"room_full"}))]).await;
    let client = PartyClient::new().unwrap();
    assert!(matches!(
        client.connect(options(url)).await,
        Err("room_full")
    ));
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(409, json!({"error":"replayed_sequence"})),
    ])
    .await;
    client.connect(options(url)).await.unwrap();
    requests.recv().await.unwrap();
    local(&client);
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert_eq!(client.view().error.as_deref(), Some("replayed_sequence"));
    let (url, _requests) = server(vec![step(400, json!({"error":"private-server-secret"}))]).await;
    assert!(matches!(
        PartyClient::new().unwrap().connect(options(url)).await,
        Err("invalid_response")
    ));
}

#[tokio::test]
async fn invalid_local_input_immediately_clears_publication_and_peer_health() {
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(200, snapshot()),
        step(200, waiting_snapshot()),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    client.connect(options(url)).await.unwrap();
    requests.recv().await.unwrap();
    local(&client);
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert!(client.view().members.iter().any(|m| m.sample.is_some()));
    let mut invalid = super::tests::playing();
    invalid["hero"].as_object_mut().unwrap().remove("health");
    client.observe_local(project_local(&invalid, true), 7);
    assert!(client.view().members.iter().all(|m| m.sample.is_none()));
    client.sync_once().await;
    let sync = requests.recv().await.unwrap();
    assert_eq!(sync.body["scope"], Value::Null);
    assert_eq!(sync.body["sample"], Value::Null);
}

#[tokio::test]
async fn own_source_expiry_withholds_peer_health_and_sends_no_old_sample() {
    let (url, mut requests) = server(vec![
        step(201, membership()),
        step(200, snapshot()),
        step(200, waiting_snapshot()),
    ])
    .await;
    let client = PartyClient::new().unwrap();
    client.connect(options(url)).await.unwrap();
    requests.recv().await.unwrap();
    local(&client);
    client.sync_once().await;
    requests.recv().await.unwrap();
    assert!(client.view().members.iter().any(|m| m.sample.is_some()));
    tokio::time::sleep(Duration::from_millis(2_010)).await;
    assert!(client.view().members.iter().all(|m| m.sample.is_none()));
    client.sync_once().await;
    let sync = requests.recv().await.unwrap();
    assert_eq!(sync.body["scope"], Value::Null);
    assert_eq!(sync.body["sample"], Value::Null);
}

#[tokio::test]
async fn oversized_relay_responses_are_rejected_without_creating_local_membership() {
    let (url, _requests) = server(vec![step(201, json!({"unexpected":"x".repeat(32*1024)}))]).await;
    let client = PartyClient::new().unwrap();
    assert!(matches!(
        client.connect(options(url)).await,
        Err("invalid_response")
    ));
    assert!(client.view().room_id.is_none());
}

struct NodeRelay(std::process::Child);

#[test]
fn every_native_command_future_can_run_on_tauris_multithreaded_runtime() {
    fn assert_send<T: Send>(_: T) {}
    let client = PartyClient::new().unwrap();
    assert_send(client.connect(options("http://127.0.0.1:8787".into())));
    assert_send(client.sync_once());
    assert_send(client.leave());
    assert_send(client.kick(PEER));
    assert_send(client.rotate_invite());
}
impl Drop for NodeRelay {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn node_relay() -> (NodeRelay, String) {
    use std::io::BufRead;
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../services/g-party-relay/server.mjs");
    let script="import {pathToFileURL} from 'node:url'; const {createRelay}=await import(pathToFileURL(process.argv[2]).href); const server=createRelay(); server.listen(0,'127.0.0.1',()=>process.stdout.write(String(server.address().port)+'\\n'));";
    let mut child = std::process::Command::new("node")
        .args(["--input-type=module", "-e", script, "g-party-integration"])
        .arg(path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .spawn()
        .expect("Node 22+ is required for the production relay integration test");
    let stdout = child.stdout.take().unwrap();
    let relay = NodeRelay(child);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut line = String::new();
        let result = std::io::BufReader::new(stdout).read_line(&mut line);
        let _ = tx.send((result, line));
    });
    let (result, line) = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("relay startup timeout");
    result.unwrap();
    let port = line
        .trim()
        .parse::<u16>()
        .expect("relay must report its loopback port");
    (relay, format!("http://127.0.0.1:{port}"))
}

#[tokio::test]
async fn production_rust_clients_share_only_matching_team_and_match_through_the_node_relay() {
    let (_relay, url) = node_relay();
    let owner = PartyClient::new().unwrap();
    let owner_view = owner.connect(options(url.clone())).await.unwrap();
    let old_invite = owner_view.invite.clone().unwrap();
    let peer = PartyClient::new().unwrap();
    let mut join = options(url.clone());
    join.invite = Some(old_invite.clone());
    join.display_name = "เพื่อน".into();
    peer.connect(join).await.unwrap();
    local(&owner);
    let mut peer_gsi = super::tests::playing();
    peer_gsi["player"]["steamid"] = json!("76561198115363194");
    peer_gsi["hero"]["name"] = json!("npc_dota_hero_mars");
    peer_gsi["hero"]["health"] = json!(420);
    peer.observe_local(project_local(&peer_gsi, true), 91);
    owner.sync_once().await;
    peer.sync_once().await;
    assert!(peer
        .view()
        .members
        .iter()
        .any(|m| m.member_id == owner_view.self_id.clone().unwrap()
            && m.sample.as_ref().is_some_and(|s| s.hp == 780)));
    tokio::time::sleep(Duration::from_millis(210)).await;
    local(&owner);
    owner.sync_once().await;
    assert!(owner.view().members.iter().any(|m| m
        .sample
        .as_ref()
        .is_some_and(|s| s.hero == "npc_dota_hero_mars" && s.hp == 420)));

    peer_gsi["player"]["team_name"] = json!("dire");
    peer.observe_local(project_local(&peer_gsi, true), 91);
    peer.sync_once().await;
    assert!(peer
        .view()
        .members
        .iter()
        .filter(|m| m.member_id != peer.view().self_id.clone().unwrap())
        .all(|m| m.state == MemberState::DifferentMatch && m.sample.is_none()));
    tokio::time::sleep(Duration::from_millis(210)).await;
    peer_gsi["player"]["team_name"] = json!("radiant");
    peer_gsi["map"]["matchid"] = json!(999999);
    peer.observe_local(project_local(&peer_gsi, true), 92);
    peer.sync_once().await;
    assert!(peer
        .view()
        .members
        .iter()
        .filter(|m| m.member_id != peer.view().self_id.clone().unwrap())
        .all(|m| m.state == MemberState::DifferentMatch && m.sample.is_none()));

    let rotated = owner.rotate_invite().await.unwrap();
    assert_ne!(rotated.invite.as_deref(), Some(old_invite.as_str()));
    let stranger = PartyClient::new().unwrap();
    let mut bad_join = options(url.clone());
    bad_join.invite = Some(old_invite);
    assert!(stranger.connect(bad_join).await.is_err());
    let peer_id = peer.view().self_id.unwrap();
    owner.kick(&peer_id).await.unwrap();
    tokio::time::sleep(Duration::from_millis(210)).await;
    peer.sync_once().await;
    assert_eq!(peer.view().status, PartyStatus::Closed);
    assert!(peer.view().members.is_empty());
    assert_eq!(owner.leave().await.status, PartyStatus::Idle);
}
