use super::*;
use crate::alpha::career::{CareerMatch, CareerParticipant, CareerStats};

fn create(name: &str) -> Value {
    json!({"action":"character_create","name":name,"style":"street","body":"female"})
}

fn delete(slot: &str, confirmation: &str) -> Value {
    json!({"action":"character_delete","character_id":slot,"confirmation_name":confirmation})
}

#[tokio::test]
async fn character_deletion_requires_the_owners_exact_name_and_persists_the_surviving_slot() {
    let mut s = server(3, 8);
    s.accounts = Some(AccountAccess::default());
    let (player, identity, _) = client(&s, "Owner").await;
    let owner = identity["profile_id"].as_str().unwrap();
    s.handle(&player, json!({"action":"account_register", "login":"garage_owner",
        "password":"a memorable test passphrase", "name":"Garage Owner"})).await.unwrap();
    let first = s.handle(&player, create("O'Neil West")).await.unwrap();
    let first_id = first["profile"]["active_character_id"].as_str().unwrap();
    s.data.lock().await.profiles.get_mut(owner).unwrap().progression.level = 13;
    let second = s.handle(&player, create("Right Lane")).await.unwrap();
    let second_id = second["profile"]["active_character_id"].as_str().unwrap();
    let (stranger, _, _) = client(&s, "Another player").await;
    let (unidentified, _, _) = test_socket(&s).await;
    let mut forged = delete(first_id, "O'Neil West");
    forged["profile_id"] = json!(owner);
    assert!(s.handle(&stranger, forged.clone()).await.is_err());
    assert!(s.handle(&unidentified, forged).await.is_err());
    for wrong in ["", "o'neil west", " O'Neil West", "O'Neil  West", "Right Lane"] {
        assert!(s.handle(&player, delete(first_id, wrong)).await.is_err());
    }
    s.alpha.lock().await.queue.push_back(crate::alpha::Ticket {
        player: player.clone(), profile: owner.into(), mode: crate::alpha::Mode::Quickplay,
        team_size: 5, map: "road_precision".into(), hero: "brz".into(), joined: timestamp(),
    });
    assert!(s.handle(&player, delete(second_id, "Right Lane")).await.unwrap_err().contains("queue"));
    s.alpha.lock().await.queue.clear();
    s.spawn(&player, "road_precision", "brz").await.unwrap();
    assert!(s.handle(&player, delete(second_id, "Right Lane")).await.unwrap_err().contains("Leave"));
    s.handle(&player, json!({"action":"world_leave"})).await.unwrap();
    let db = rusqlite::Connection::open(s.path.with_extension("sqlite3")).unwrap();
    db.execute_batch("CREATE TRIGGER reject_test_write BEFORE UPDATE ON player_profiles
        BEGIN SELECT RAISE(ABORT, 'test write failure'); END;").unwrap();
    assert!(s.handle(&player, delete(second_id, "Right Lane")).await.is_err());
    db.execute_batch("DROP TRIGGER reject_test_write;").unwrap();
    drop(db);
    assert_eq!(s.data.lock().await.profiles[owner].characters.len(), 2);
    let response = s.handle(&player, delete(second_id, "Right Lane")).await.unwrap();
    assert_eq!(response["profile"]["active_character_id"], first_id);
    assert_eq!(response["profile"]["progression"]["level"], 13);
    assert!(response["profile"]["progression"]["cosmetics_revision"].as_u64() >
        second["profile"]["progression"]["cosmetics_revision"].as_u64());
    let restarted = database::load_or_import(&s.path.with_extension("sqlite3"), &s.path).unwrap();
    let saved = &restarted.profiles[owner];
    assert!(saved.account.is_some());
    assert_eq!(saved.characters.len(), 1);
    assert_eq!(saved.career_id(), first_id);
    assert_eq!(saved.progression.level, 13);
    assert!(s.handle(&stranger, create("O'Neil West")).await.is_err());
    assert!(s.handle(&stranger, create("RIGHT LANE")).await.is_ok());

    let third = s.handle(&player, create("New Lane")).await.unwrap();
    let third_id = third["profile"]["active_character_id"].as_str().unwrap();
    let inactive_removed = s.handle(&player, delete(first_id, "O'Neil West")).await.unwrap();
    assert_eq!(inactive_removed["profile"]["active_character_id"], third_id);
    assert_eq!(inactive_removed["profile"]["progression"]["level"], 1);
    assert!(inactive_removed["profile"]["progression"]["cosmetics_revision"].as_u64() >
        third["profile"]["progression"]["cosmetics_revision"].as_u64());
    cleanup(s).await;
}

#[tokio::test]
async fn character_deletion_of_last_slot_retires_its_id_and_late_results() {
    let mut s = server(3, 8);
    s.accounts = Some(AccountAccess::default());
    let (player, identity, _) = client(&s, "Owner").await;
    let owner = identity["profile_id"].as_str().unwrap();
    let first = s.handle(&player, create("Track Fox")).await.unwrap();
    assert_eq!(first["profile"]["active_character_id"], owner);
    let active_revision = first["profile"]["progression"]["cosmetics_revision"].as_u64().unwrap();
    let empty = s.handle(&player, delete(owner, "Track Fox")).await.unwrap();
    assert!(empty["profile"]["active_character_id"].is_null());
    assert_eq!(empty["profile"]["characters"], json!([]));
    assert!(empty["profile"]["progression"]["cosmetics_revision"].as_u64().unwrap() > active_revision);
    let reopened = database::load_or_import(&s.path.with_extension("sqlite3"), &s.path).unwrap();
    let fresh_id = reopened.profiles[owner].career_id().to_owned();
    assert_ne!(fresh_id, owner);

    let (teammate, identity, _) = client(&s, "Teammate").await;
    let other_id = identity["profile_id"].as_str().unwrap();
    let participant = |profile: &str, name: &str| CareerParticipant {
        profile_id: profile.into(), name: name.into(), hero:"brz".into(),
        stats: CareerStats { kills: 1, ..Default::default() }, ..Default::default()
    };
    let record = CareerMatch {
        match_id: "prior-track-run".into(), world_id: 1, mode: crate::alpha::Mode::Sandbox,
        map: "road_precision".into(), ended_at: timestamp(),
        participants: vec![participant(owner, "Track Fox"), participant(other_id, "Teammate")],
        ..Default::default()
    };
    s.persist_record(&record).await.unwrap();
    let history = json!({"action":"career_history"});
    assert!(s.handle(&player, history.clone()).await.unwrap()["matches"].as_array().unwrap().is_empty());
    assert_eq!(s.handle(&teammate, history.clone()).await.unwrap()["matches"][0]["match_id"], "prior-track-run");
    let reused = s.handle(&player, create("Track Fox")).await.unwrap();
    assert_eq!(reused["profile"]["active_character_id"], fresh_id);
    assert_eq!(reused["profile"]["progression"]["career"]["summary"]["totals"]["kills"], 0);
    assert!(s.handle(&player, delete(owner, "Track Fox")).await.is_err());
    assert!(s.handle(&player, history).await.unwrap()["matches"].as_array().unwrap().is_empty());
    assert!(s.handle(&player, json!({"action":"career_match","match_id":"prior-track-run"})).await.is_err());
    cleanup(s).await;
}
