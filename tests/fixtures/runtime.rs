use std::io::{Read,Write};
fn main(){
    if std::env::args().any(|arg|arg=="child"){std::thread::sleep(std::time::Duration::from_secs(60));return;}
    let mut prompt=String::new();std::io::stdin().read_to_string(&mut prompt).unwrap();
    if prompt=="writer" {
        let args:Vec<String>=std::env::args().collect();
        assert!(args.windows(2).any(|pair|pair[0]=="--tools" && pair[1].is_empty()));
        assert!(args.windows(2).any(|pair|pair[0]=="--permission-mode" && pair[1]=="default"));
        assert!(args.iter().any(|arg|arg=="--json-schema"));
        assert!(!args.iter().any(|a|a.contains("skip-permissions")));
        println!("{}",r#"{"type":"result","subtype":"success","is_error":false,"result":"Generated structured output","structured_output":{"files":[{"path":"example.mjs","content":"export const fixture = true;\n"}]}}"#);
        return;
    }
    println!("{{\"type\":\"thread.started\",\"thread_id\":\"fixture-session\"}}");
    if prompt=="sleep"{
        let child=std::process::Command::new(std::env::current_exe().unwrap()).arg("child").spawn().unwrap();
        println!("{{\"type\":\"fixture.child\",\"pid\":{}}}",child.id());std::io::stdout().flush().unwrap();
        std::thread::sleep(std::time::Duration::from_secs(60));
    }
    if prompt=="large"{println!("{}","x".repeat(40000));return;}
    if prompt=="error"{eprintln!("password=fixture-secret");println!("{{\"type\":\"turn.failed\",\"error\":{{\"message\":\"Fixture failed\"}}}}");std::process::exit(1);}
    if prompt=="malformed"{return;}
    println!("{{\"type\":\"item.completed\",\"item\":{{\"type\":\"agent_message\",\"text\":\"FIXTURE_ONLY\"}}}}");
    println!("{{\"type\":\"turn.completed\"}}");
}
