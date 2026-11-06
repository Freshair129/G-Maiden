//! G-Party native boundary. Only trusted Control can consent to or manage a room.

use g_party::{
    ConnectOptions, LocalObservation, PartyClient, PartyView, SocialJoinOptions, SocialProof,
};
use tauri::{AppHandle, Manager, WebviewWindow};

struct PartyState {
    client: PartyClient,
}

fn active_session(session: &crate::runtime::MatchSessionSnapshot) -> bool {
    session.session_epoch != 0
        && matches!(
            session.session_lifecycle,
            Some(crate::runtime::MatchLifecycle::Draft | crate::runtime::MatchLifecycle::Live)
        )
        && crate::runtime::in_game()
        && crate::runtime::gsi_is_fresh()
        && crate::runtime::is_current_session_epoch(session.session_epoch)
}

fn refresh_context(client: &PartyClient) {
    let session = crate::runtime::match_session_snapshot();
    let active = active_session(&session);
    let owner = active.then(crate::local_player::active_steam_id).flatten();
    client.validate_source_context(owner.as_deref(), session.session_epoch, active);
}

pub(crate) fn install(app: &AppHandle) -> Result<(), &'static str> {
    let client = PartyClient::new()?;
    app.manage(PartyState {
        client: client.clone(),
    });
    tauri::async_runtime::spawn(async move {
        loop {
            refresh_context(&client);
            let delay = client.sync_once().await;
            tokio::time::sleep(delay).await;
        }
    });
    Ok(())
}

pub(crate) fn observe_local(
    app: &AppHandle,
    observation: Option<LocalObservation>,
    session: &crate::runtime::MatchSessionSnapshot,
) {
    if let Some(state) = app.try_state::<PartyState>() {
        state.client.observe_local(
            observation.filter(|_| active_session(session)),
            session.session_epoch,
        );
    }
}

pub(crate) fn invalidate_local(app: &AppHandle) {
    if let Some(state) = app.try_state::<PartyState>() {
        state.client.observe_local(None, 0);
    }
}

fn trusted_client(app: &AppHandle, window: &WebviewWindow) -> Result<PartyClient, String> {
    if window.label() != "control" {
        return Err("untrusted_surface".into());
    }
    let bootstrap = app
        .try_state::<crate::OverlayBootstrap>()
        .ok_or("untrusted_surface")?;
    let root = bootstrap
        .state
        .lock()
        .map_err(|_| "untrusted_surface")?
        .root();
    let url = window.url().map_err(|_| "untrusted_surface")?;
    if !root.trusts(url.as_str()) {
        return Err("untrusted_surface".into());
    }
    app.try_state::<PartyState>()
        .map(|state| state.client.clone())
        .ok_or_else(|| "party_unavailable".into())
}

fn current_view(client: &PartyClient) -> PartyView {
    refresh_context(client);
    client.view()
}

#[tauri::command]
pub(crate) async fn party_connect(
    app: AppHandle,
    window: WebviewWindow,
    relay_url: String,
    display_name: String,
    invite: Option<String>,
    consent: bool,
) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    client
        .connect(ConnectOptions {
            relay_url,
            display_name,
            invite,
            consent,
        })
        .await
        .map_err(str::to_owned)?;
    Ok(current_view(&client))
}

#[tauri::command]
pub(crate) fn party_get_state(app: AppHandle, window: WebviewWindow) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    Ok(current_view(&client))
}

#[tauri::command]
pub(crate) async fn party_leave(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    client.leave().await;
    Ok(current_view(&client))
}

#[tauri::command]
pub(crate) async fn party_kick(
    app: AppHandle,
    window: WebviewWindow,
    member_id: String,
) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    client.kick(&member_id).await.map_err(str::to_owned)?;
    Ok(current_view(&client))
}

#[tauri::command]
pub(crate) async fn party_rotate_invite(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    client.rotate_invite().await.map_err(str::to_owned)?;
    Ok(current_view(&client))
}

#[tauri::command]
pub(crate) async fn party_social_proof(
    app: AppHandle,
    window: WebviewWindow,
    challenge: String,
    relay_url: String,
) -> Result<SocialProof, String> {
    trusted_client(&app, &window)?
        .social_proof(challenge, relay_url)
        .await
}
#[tauri::command]
pub(crate) async fn party_join_social(
    app: AppHandle,
    window: WebviewWindow,
    ticket: String,
    relay_url: String,
    room_id: String,
    display_name: String,
    consent: bool,
) -> Result<PartyView, String> {
    let client = trusted_client(&app, &window)?;
    client
        .join_social(SocialJoinOptions {
            ticket,
            relay_url,
            room_id,
            display_name,
            consent,
        })
        .await?;
    Ok(current_view(&client))
}
