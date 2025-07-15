use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
    ffi::CStr
};
use lazy_static::lazy_static;
use rusb::{Context, Device, DeviceDescriptor, DeviceHandle, DeviceList, GlobalContext};
use serde::{Deserialize, Serialize};
use tauri::command;
use windows::{
    core::{PCSTR, PCWSTR},
    Win32::{
        Devices::DeviceAndDriverInstallation::{
            CM_Locate_DevNodeW, CM_Reenumerate_DevNode, CR_SUCCESS, DIGCF_ALLCLASSES, 
            DIGCF_PRESENT, SetupDiClassGuidsFromNameW, SetupDiCreateDeviceInfoList, 
            SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, SetupDiGetClassDevsW, 
            SetupDiGetDeviceInstanceIdW, SetupDiOpenDevRegKey, SetupDiSetDeviceRegistryPropertyW,
            SP_DEVINFO_DATA, SPDRP_CONFIGFLAGS, DIREG_DEV, DICS_DISABLE, DICS_ENABLE,
            SetupDiCallClassInstaller, DIF_PROPERTYCHANGE, SP_CLASSINSTALL_HEADER,
            SP_PROPCHANGE_PARAMS, CM_GETIDLIST_FILTER_PRESENT, CM_Get_Device_ID_List_SizeW,
            CM_Get_Device_ID_ListW, CM_Get_Device_Interface_List_SizeW, CM_Get_Device_Interface_ListW,
            CM_Get_Device_Interface_PropertyW, CM_Get_DevNode_PropertyW, CM_Get_DevNode_Status,
            CM_Locate_DevNodeW, CM_Reenumerate_DevNode, CR_SUCCESS, DIGCF_ALLCLASSES, 
            DIGCF_DEVICEINTERFACE, DIGCF_PRESENT, SetupDiClassGuidsFromNameW, 
            SetupDiCreateDeviceInfoList, SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInfo, 
            SetupDiGetClassDevsW, SetupDiGetDeviceInstanceIdW, SetupDiOpenDevRegKey, 
            SetupDiSetDeviceRegistryPropertyW, SP_DEVINFO_DATA, SPDRP_CONFIGFLAGS, DIREG_DEV,
        },
        Foundation::{HANDLE, HWND, ERROR_SUCCESS},
        Storage::FileSystem::INVALID_HANDLE_VALUE,
        System::{
            Registry::{RegCloseKey, RegSetValueExA, HKEY, KEY_SET_VALUE, REG_DWORD},
            Threading::{GetCurrentProcess, GetCurrentThreadId},
        },
    },
};



// Shared state for trusted devices
lazy_static! {
    static ref TRUSTED_DEVICES: Arc<Mutex<HashSet<(u16, u16)>>> = Arc::new(Mutex::new(HashSet::new()));
    static ref AUTOBLOCK_ENABLED: Arc<Mutex<bool>> = Arc::new(Mutex::new(true));
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsbDeviceInfo {
    vendor_id: u16,
    product_id: u16,
    manufacturer: Option<String>,
    product: Option<String>,
    serial_number: Option<String>,
    port_number: Option<u8>,
    connected: bool,
    trusted: bool,
}

#[command]
pub fn get_usb_devices() -> Result<Vec<UsbDeviceInfo>, String> {
    let devices = DeviceList::new().map_err(|e| e.to_string())?;
    
    let trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    let mut result = Vec::new();

    for device in devices.iter() {
        let descriptor = device.device_descriptor().map_err(|e| e.to_string())?;
        
        let (manufacturer, product, serial_number) = match device.open() {
            Ok(handle) => (
                read_usb_string(&handle, descriptor.manufacturer_string_index()),
                read_usb_string(&handle, descriptor.product_string_index()),
                read_usb_string(&handle, descriptor.serial_number_string_index())
            ),
            Err(_) => (None, None, None),
        };

        let trusted = trusted_devices.contains(&(descriptor.vendor_id(), descriptor.product_id()));

        result.push(UsbDeviceInfo {
            vendor_id: descriptor.vendor_id(),
            product_id: descriptor.product_id(),
            manufacturer,
            product,
            serial_number,
            port_number: None,
            connected: true,
            trusted,
        });
    }

    Ok(result)
}

fn read_usb_string(handle: &DeviceHandle<GlobalContext>, index: Option<u8>) -> Option<String> {
    match index {
        Some(idx) if idx != 0 => {
            match handle.read_string_descriptor_ascii(idx) {
                Ok(s) => Some(s),
                Err(_) => None,
            }
        }
        _ => None,
    }
}

#[command]
pub fn add_trusted_device(vendor_id: u16, product_id: u16) -> Result<(), String> {
    let mut trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    trusted_devices.insert((vendor_id, product_id));
    Ok(())
}

#[command]
pub fn remove_trusted_device(vendor_id: u16, product_id: u16) -> Result<(), String> {
    let mut trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    trusted_devices.remove(&(vendor_id, product_id));
    Ok(())
}

#[command]
pub fn get_trusted_devices() -> Result<Vec<(u16, u16)>, String> {
    let trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    Ok(trusted_devices.iter().cloned().collect())
}

#[command]
pub fn set_autoblock_mode(enabled: bool) -> Result<(), String> {
    let mut autoblock = AUTOBLOCK_ENABLED.lock().unwrap();
    *autoblock = enabled;
    Ok(())
}

#[command]
pub fn get_autoblock_mode() -> Result<bool, String> {
    let autoblock = AUTOBLOCK_ENABLED.lock().unwrap();
    Ok(*autoblock)
}

#[command]
pub fn block_all_usb_ports() -> Result<(), String> {
    // Block at system level
    set_registry_value(
        HKEY_LOCAL_MACHINE,
        "SYSTEM\\CurrentControlSet\\Services\\USBSTOR",
        "Start",
        4
    )?;

    // Block at user level
    set_registry_value(
        HKEY_CURRENT_USER,
        "Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices",
        "Deny_All",
        1
    )?;

    restart_usb_service()?;
    Ok(())
}

#[command]
pub fn unblock_usb_port() -> Result<(), String> {
    // Unblock at system level
    set_registry_value(
        HKEY_LOCAL_MACHINE,
        "SYSTEM\\CurrentControlSet\\Services\\USBSTOR",
        "Start",
        3
    )?;

    // Remove user-level restrictions
    unsafe {
        RegDeleteKeyA(
            HKEY_CURRENT_USER,
            PCSTR(b"Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\0".as_ptr())
        );
    }

    restart_usb_service()?;
    Ok(())
}

#[command]
pub fn restart_usb_service() -> Result<(), String> {
    // Stop service
    let _ = std::process::Command::new("net")
        .args(&["stop", "USBSTOR"])
        .status()
        .map_err(|e| e.to_string())?;
    
    // Start service
    std::process::Command::new("net")
        .args(&["start", "USBSTOR"])
        .status()
        .map_err(|e| e.to_string())?;

    // Update group policy
    std::process::Command::new("gpupdate")
        .args(&["/force"])
        .status()
        .map_err(|e| e.to_string())?;

    Ok(())
}

fn set_registry_value(hkey: HKEY, path: &str, value_name: &str, value: u32) -> Result<(), String> {
    unsafe {
        let mut key_handle: HKEY = HKEY::default();
        let path_pcstr = PCSTR(path.as_ptr());
        let value_name_pcstr = PCSTR(value_name.as_ptr());

        // Open or create key
        let status = if hkey == HKEY_LOCAL_MACHINE {
            RegOpenKeyExA(hkey, path_pcstr, 0, KEY_SET_VALUE, &mut key_handle)
        } else {
            // Simplified key creation for user-level
            RegCreateKeyA(
                hkey,
                path_pcstr,
                &mut key_handle
            )
        };

        if status != windows::Win32::Foundation::WIN32_ERROR(0) {
            return Err(format!("Registry access failed (Error {})", status.0));
        }

        // Set value
        let value_bytes = value.to_le_bytes();
        let status = RegSetValueExA(
            key_handle,
            value_name_pcstr,
            0,
            REG_DWORD,
            Some(&value_bytes)
        );

        RegCloseKey(key_handle);

        if status != windows::Win32::Foundation::WIN32_ERROR(0) {
            return Err(format!("Failed to set value (Error {})", status.0));
        }
    }
    Ok(())
}



#[command]
pub fn block_device(vendor_id: u16, product_id: u16) -> Result<(), String> {
    let hwid = format!("USB\\VID_{:04X}&PID_{:04X}", vendor_id, product_id);
    set_device_state(&hwid, false)
}

#[command]
pub fn unblock_device(vendor_id: u16, product_id: u16) -> Result<(), String> {
    let hwid = format!("USB\\VID_{:04X}&PID_{:04X}", vendor_id, product_id);
    set_device_state(&hwid, true)
}

fn set_device_state(hardware_id: &str, enable: bool) -> Result<(), String> {
    unsafe {
        // Convert to UTF-16 for Windows API
        let hwid_wide: Vec<u16> = hardware_id.encode_utf16().chain(Some(0)).collect();
        
        // Get device information set
        let device_info_set = SetupDiGetClassDevsW(
            None,
            Some(PCWSTR(hwid_wide.as_ptr())),
            HWND(0),
            DIGCF_PRESENT | DIGCF_ALLCLASSES,
        );
        
        if device_info_set == INVALID_HANDLE_VALUE {
            return Err("Failed to get device information set".to_string());
        }
        
        // Create device info data structure
        let mut device_info_data = SP_DEVINFO_DATA {
            cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
            ..Default::default()
        };
        
        // Enumerate devices
        let mut result = Err("Device not found".to_string());
        for index in 0.. {
            if !SetupDiEnumDeviceInfo(device_info_set, index, &mut device_info_data).as_bool() {
                break;
            }
            
            // Get device instance ID
            let mut instance_id_buffer = [0u16; 256];
            if SetupDiGetDeviceInstanceIdW(
                device_info_set,
                &device_info_data,
                &mut instance_id_buffer,
                instance_id_buffer.len() as u32,
                None,
            ).as_bool()
            {
                let instance_id = String::from_utf16_lossy(
                    &instance_id_buffer[..instance_id_buffer.iter().position(|&x| x == 0).unwrap_or(0)]
                );
                
                if instance_id.contains(hardware_id) {
                    // Found our device - change state
                    let mut propchange_params = SP_PROPCHANGE_PARAMS {
                        ClassInstallHeader: SP_CLASSINSTALL_HEADER {
                            cbSize: std::mem::size_of::<SP_PROPCHANGE_PARAMS>() as u32,
                            InstallFunction: DIF_PROPERTYCHANGE,
                        },
                        StateChange: if enable { DICS_ENABLE } else { DICS_DISABLE },
                        Scope: 0, // Global
                        HwProfile: 0,
                    };
                    
                    // Set class installer parameters
                    if SetupDiSetClassInstallParamsW(
                        device_info_set,
                        &device_info_data,
                        &propchange_params.ClassInstallHeader,
                        std::mem::size_of::<SP_PROPCHANGE_PARAMS>() as u32,
                    ).as_bool()
                    {
                        // Call class installer
                        if SetupDiCallClassInstaller(
                            DIF_PROPERTYCHANGE,
                            device_info_set,
                            &device_info_data,
                        ).as_bool()
                        {
                            result = Ok(());
                        } else {
                            result = Err("Failed to call class installer".to_string());
                        }
                    } else {
                        result = Err("Failed to set class install params".to_string());
                    }
                    break;
                }
            }
        }
        
        // Cleanup
        SetupDiDestroyDeviceInfoList(device_info_set);
        result
    }
}

#[command]
pub fn block_all_untrusted() -> Result<(), String> {
    let devices = get_usb_devices()?;
    let trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    
    for device in devices {
        if !trusted_devices.contains(&(device.vendor_id, device.product_id)) {
            if let Err(e) = block_device(device.vendor_id, device.product_id) {
                eprintln!("Failed to block device: {}", e);
            }
        }
    }
    
    Ok(())
}

#[command]
pub fn unblock_all_trusted() -> Result<(), String> {
    let trusted_devices = TRUSTED_DEVICES.lock().unwrap();
    
    for (vendor_id, product_id) in trusted_devices.iter() {
        if let Err(e) = unblock_device(*vendor_id, *product_id) {
            eprintln!("Failed to unblock device: {}", e);
        }
    }
    
    Ok(())
}

