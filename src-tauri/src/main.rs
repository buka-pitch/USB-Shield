// Prevents additional console window on Windows in release, DO NOT REMOVE!!
// #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] 



#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]




mod usb;

use usb::commands::*;

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_usb_devices,
            block_all_usb_ports,
            unblock_usb_port,
            restart_usb_service,
            add_trusted_device,
            remove_trusted_device,
            get_trusted_devices,
            get_autoblock_mode, 
            set_autoblock_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}