//! Local single-file import; the signed Store path keeps its own provenance.
use std::{fs,io::{Read,Seek,SeekFrom},path::Path,sync::Mutex};
use super::{id_manifest,paths,types::ImportResult};
#[derive(serde::Serialize,serde::Deserialize)]
struct Origin{announcer_id:String,container_sha256:String,manifest_sha256:String}
fn origin(id:&str)->Option<Origin>{
 if !g_ann_package::valid_id(id,"ann_"){return None}
 let dir=paths::packs_dir().join(id);
 let raw=id_manifest::bounded_bytes(&dir.join("local-gann.json"),4096).ok()?;
 let record:Origin=serde_json::from_slice(&raw).ok()?;
 if record.announcer_id!=id || record.container_sha256.len()!=64 || !record.container_sha256.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){return None}
 id_manifest::verified_bytes(&dir.join(format!("{id}.json")),&record.manifest_sha256,2*1024*1024).ok()?;
 if !paths::voice_root().join("containers").join(format!("{}.gann",record.container_sha256)).is_file(){return None}
 Some(record)
}
pub(super) fn is_local_package(id:&str)->bool{origin(id).is_some()}
pub(super) fn open_local_clip(id:&str,relative:&Path)->Result<fs::File,String>{
 let dir=paths::packs_dir().join(id);let registry=id_manifest::read(&dir)?;
 let name=relative.to_string_lossy().replace('\\',"/");
 let expected=registry.files().into_iter().find(|(p,_)|*p==name && p.starts_with("audio/")).ok_or("Sound is not indexed by the local package")?.1;
 let path=super::path_safety::safe_pack_path(&dir,&name).ok_or("Unsafe local sound")?;
 let mut file=fs::File::open(path).map_err(|e|e.to_string())?;let mut bytes=Vec::new();Read::by_ref(&mut file).take(16*1024*1024+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
 if bytes.len()>16*1024*1024 || g_ann_package::sha256(&bytes)!=expected{return Err("Local .gann sound SHA-256 mismatch".into())}
 file.seek(SeekFrom::Start(0)).map_err(|e|e.to_string())?;Ok(file)
}
pub fn import_file(source:&Path)->Result<ImportResult,String>{
 static IMPORT:Mutex<()>=Mutex::new(());let _guard=IMPORT.try_lock().map_err(|_|"Another container import is running")?;
 if source.extension().and_then(|s|s.to_str()).is_none_or(|ext|!ext.eq_ignore_ascii_case("gann")){return Err("Choose a .gann file".into())}
 let package=g_ann_package::Package::open(source)?;let id=&package.index.announcer_id;
 let packs=paths::packs_dir();fs::create_dir_all(&packs).map_err(|e|e.to_string())?;let dest=packs.join(id);
 if dest.exists(){
  let old=origin(id).ok_or("This announcer ID already exists; installed package was preserved")?;
  if old.container_sha256!=package.digest{return Err("Same announcer ID has different content; installed package was preserved".into())}
  id_manifest::read(&dest)?.admit(&dest)?;
  return Ok(ImportResult{imported:vec![id.clone()]})
 }
 let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_nanos();
 let stage=packs.join(format!(".gann-stage-{}-{nonce}",std::process::id()));fs::create_dir(&stage).map_err(|e|e.to_string())?;
 let result=(||{
  package.extract(&stage)?;let registry=id_manifest::read(&stage)?;registry.admit(&stage)?;
  let containers=paths::voice_root().join("containers");fs::create_dir_all(&containers).map_err(|e|e.to_string())?;
  let archive=containers.join(format!("{}.gann",package.digest));
  if archive.exists(){if g_ann_package::file_digest(&archive)?!=package.digest{return Err("Stored container is corrupt".into())}}
  else{
   let temporary=containers.join(format!(".gann-{}-{nonce}.tmp",std::process::id()));
   let copied=package.save_copy(&temporary).and_then(|_|fs::rename(&temporary,&archive).map_err(|e|e.to_string()));
   if temporary.is_file(){let _=fs::remove_file(&temporary);}copied?;
  }
  let record=Origin{announcer_id:id.clone(),container_sha256:package.digest.clone(),manifest_sha256:package.index.files.iter().find(|e|e.path==package.index.manifest).ok_or("Missing manifest index")?.sha256.clone()};
  fs::write(stage.join("local-gann.json"),serde_json::to_vec_pretty(&record).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
  if dest.exists(){return Err("Destination appeared during import".into())}
  fs::rename(&stage,&dest).map_err(|e|e.to_string())?;
  Ok(ImportResult{imported:vec![id.clone()]})
 })();
 // Only this generated directory contains disposable copies from this import.
 if stage.is_dir(){if let (Ok(root),Ok(target))=(packs.canonicalize(),stage.canonicalize()){if target!=root && target.starts_with(root){let _=fs::remove_dir_all(target);}}}
 result
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]#[ignore="requires GANN_FIXTURE file"]fn real_container_import_reload_and_preserve(){
 let source=std::env::var("GANN_FIXTURE").unwrap();
 let root=std::env::temp_dir().join(format!("gm-gann-test-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();
 super::super::paths::set_test_voice_root(Some(root.clone()));
 struct Cleanup(std::path::PathBuf);impl Drop for Cleanup{fn drop(&mut self){super::super::paths::set_test_voice_root(None);super::super::pack_io::clear_resolved_cache_for_test();let _=std::fs::remove_dir_all(&self.0);}}
 let _cleanup=Cleanup(root.clone());
 let imported=import_file(Path::new(&source)).expect("single-file import must succeed");assert_eq!(imported.imported.len(),1);
 assert!(super::super::pack_io::read_active_pack_id().is_none());
 let original=g_ann_package::Package::open(Path::new(&source)).unwrap();
 let installed=root.join("packs").join(&original.index.announcer_id);
 let registry_path=installed.join(&original.index.manifest);
 let mut changed:serde_json::Value=serde_json::from_slice(&std::fs::read(&registry_path).unwrap()).unwrap();changed["name"]="Conflicting revision".into();
 let conflict_source=root.join("conflicting-source");std::fs::create_dir(&conflict_source).unwrap();original.extract(&conflict_source).unwrap();
 std::fs::write(conflict_source.join(&original.index.manifest),serde_json::to_vec(&changed).unwrap()).unwrap();
 let conflict=root.join("conflict.gann");g_ann_package::create(&conflict_source,&original.index.manifest,&conflict).unwrap();assert!(import_file(&conflict).is_err());
 assert!(is_local_package(&original.index.announcer_id));

 let id=&imported.imported[0];assert_eq!(import_file(Path::new(&source)).unwrap().imported,imported.imported);
 super::super::activate_if_exists(id).unwrap();
 for event in ["first_blood","double_kill","rampage"]{let clip=super::super::select_announcer_clip(event).unwrap();assert!(clip.pair.is_some());let rel=clip.path.strip_prefix(&installed).unwrap();assert!(open_local_clip(&imported.imported[0],rel).is_ok());}
 let bad=root.join("bad.gann");std::fs::write(&bad,b"bad").unwrap();assert!(import_file(&bad).is_err());
 assert_eq!(super::super::pack_io::read_active_pack_id().as_deref(),Some(id.as_str()));
 }
}
