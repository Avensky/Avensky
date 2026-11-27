use super::*;

fn layout(x: f64) -> Value {
    let mut room = json!({});
    for prop in ["lockers", "desk", "shelf", "toolbox", "jack", "crane"] {
        room[prop] = json!({ "x": x, "z": -4.0, "yaw": 1.3 });
    }
    room
}

#[tokio::test]
async fn garage_layout_is_private_revisioned_and_survives_sqlite_restart() {
    let mut s = server(1, 3);
    s.accounts = Some(AccountAccess::default());
    let (a, identity, _) = client(&s, "A").await;
    let (b, other, _) = client(&s, "B").await;
    let (unidentified, _, _) = test_socket(&s).await;
    let get = json!({ "action": "garage_layout_get", "owner": other["profile_id"] });
    let save = |revision, room| json!({
        "action": "garage_layout_save", "revision": revision, "layout": room,
        "owner": other["profile_id"], "world_id": 42
    });
    assert!(s.handle(&unidentified, get.clone()).await.is_err());
    let initial = s.handle(&a, get.clone()).await.unwrap();
    assert_eq!(initial, json!({ "owner": identity["profile_id"], "revision": 0, "layout": null }));
    let first = s.handle(&a, save(0, layout(-2.0))).await.unwrap();
    assert_eq!(first["revision"], 1);
    assert_eq!(first["layout"], layout(-2.0));
    assert_eq!(s.handle(&a, save(0, layout(-2.0))).await.unwrap(), first);
    let conflict = s.handle(&a, save(0, layout(5.0))).await.unwrap();
    assert_eq!(conflict["conflict"], true);
    assert_eq!(conflict["layout"], first["layout"]);
    let mut unknown = layout(0.0);
    unknown["unknown_asset"] = json!({"x":0,"z":0,"yaw":0});
    assert!(s.handle(&a, save(1, unknown)).await.is_err());
    assert!(s.handle(&a, save(1, layout(12.0))).await.is_err());
    assert_eq!(s.handle(&b, get.clone()).await.unwrap()["layout"], Value::Null);
    assert_eq!(s.handle(&a, get).await.unwrap(), first);
    let saved = database::load_or_import(&s.path.with_extension("sqlite3"), &s.path).unwrap();
    let owner = identity["profile_id"].as_str().unwrap();
    let profile = saved.profile(owner).unwrap();
    assert_eq!(profile.garage.as_ref().unwrap().revision, 1);
    assert!(profile.player_view(true).get("garage").is_none());
    assert!(saved.profile(other["profile_id"].as_str().unwrap()).unwrap().garage.is_none());
    assert!(saved.worlds.is_empty());
}
