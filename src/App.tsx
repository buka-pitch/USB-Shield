import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { UsbDeviceInfo, TrustedDevice } from "./types";
import { DeviceCard } from "./components/DeviceCard";
import { EmptyState } from "./components/EmptyState";
import { ErrorAlert } from "./components/ErrorAlert";
import { LoadingScreen } from "./components/LoadingScreen";
import "./App.css";
export const App = () => {
  const [devices, setDevices] = useState<UsbDeviceInfo[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [autoblockEnabled, setAutoblockEnabled] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [blockStatus, setBlockStatus] = useState<
    "idle" | "blocking" | "unblocking"
  >("idle");

  useEffect(() => {
    const initializeApp = async (): Promise<UnlistenFn | void> => {
      try {
        await Promise.all([
          refreshDevices(),
          refreshTrustedDevices(),
          checkAutoblockMode(),
        ]);

        const unlisten = await listen("usb-device-changed", refreshDevices);
        return unlisten;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    const cleanupPromise = initializeApp();

    return () => {
      cleanupPromise.then((unlisten) => {
        if (unlisten && typeof unlisten === "function") {
          unlisten();
        }
      });
    };
  }, []);

  const refreshDevices = async (): Promise<void> => {
    try {
      const result = await invoke<UsbDeviceInfo[]>("get_usb_devices");
      setDevices(result);
      setError(null);
    } catch (err) {
      setError(
        `Failed to fetch devices: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const refreshTrustedDevices = async (): Promise<void> => {
    try {
      const result = await invoke<TrustedDevice[]>("get_trusted_devices");
      setTrustedDevices(result);
    } catch (err) {
      setError(
        `Failed to fetch trusted devices: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const checkAutoblockMode = async (): Promise<void> => {
    try {
      const result = await invoke<boolean>("get_autoblock_mode");
      setAutoblockEnabled(result);
    } catch (err) {
      setError(
        `Failed to get autoblock status: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const toggleDeviceTrust = async (device: UsbDeviceInfo): Promise<void> => {
    try {
      if (device.trusted) {
        await invoke("remove_trusted_device", {
          vendorId: device.vendor_id,
          productId: device.product_id,
        });
      } else {
        await invoke("add_trusted_device", {
          vendorId: device.vendor_id,
          productId: device.product_id,
        });
      }
      await Promise.all([refreshDevices(), refreshTrustedDevices()]);
    } catch (err) {
      setError(
        `Failed to update device trust: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const toggleAutoblock = async (): Promise<void> => {
    try {
      const newMode = !autoblockEnabled;
      await invoke("set_autoblock_mode", { enabled: newMode });
      setAutoblockEnabled(newMode);
    } catch (err) {
      setError(
        `Failed to toggle autoblock: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  const blockAllPorts = async () => {
    setBlockStatus("blocking");
    try {
      await invoke("block_all_usb_ports");
      await invoke("restart_usb_service");
      await refreshDevices();
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setBlockStatus("idle");
    }
  };

  const unblockPorts = async (): Promise<void> => {
    try {
      await invoke("unblock_usb_port");
      await refreshDevices();
    } catch (err) {
      setError(
        `Failed to unblock ports: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  };

  // Separate devices into trusted/untrusted
  const trustedDeviceList = devices.filter((d) => d.trusted);
  const untrustedDeviceList = devices.filter((d) => !d.trusted);

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      {/* Header */}
      <header className="mb-10 text-center">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-pink-500">
          UShield
        </h1>
        <p className="mt-2 text-lg text-cyan-200 font-mono">
          Advanced USB Port Security
        </p>
      </header>

      {/* Error Alert */}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div className="p-6 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 shadow-lg">
          <h3 className="text-xl font-semibold mb-4 text-cyan-300">
            System Controls
          </h3>
          {blockStatus}
          <div className="flex flex-wrap gap-4 mb-6">
            <button
              onClick={blockAllPorts}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-pink-600 to-pink-700 hover:from-pink-500 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-pink-500/20"
            >
              Block All Ports
            </button>
            <button
              onClick={unblockPorts}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 transition-all duration-300 shadow-lg hover:shadow-cyan-500/20"
            >
              Unblock Ports
            </button>
          </div>
          <label className="flex items-center cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={autoblockEnabled}
                onChange={toggleAutoblock}
              />
              <div
                className={`block w-14 h-8 rounded-full ${
                  autoblockEnabled ? "bg-cyan-500" : "bg-gray-600"
                }`}
              ></div>
              <div
                className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition ${
                  autoblockEnabled ? "transform translate-x-6" : ""
                }`}
              ></div>
            </div>
            <div className="ml-3 text-gray-300 font-medium">
              Auto-block Mode
            </div>
          </label>
        </div>

        {/* Stats Card */}
        <div className="grid grid-cols-3 gap-4 p-6 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 shadow-lg">
          <div className="text-center">
            <div className="text-4xl font-bold text-cyan-400">
              {devices.length}
            </div>
            <div className="text-sm text-gray-400 mt-1">Total Devices</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-green-400">
              {trustedDeviceList.length}
            </div>
            <div className="text-sm text-gray-400 mt-1">Trusted</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-pink-400">
              {untrustedDeviceList.length}
            </div>
            <div className="text-sm text-gray-400 mt-1">Untrusted</div>
          </div>
        </div>
      </div>

      {/* Device Lists */}
      <div className="space-y-10">
        {/* Trusted Devices */}
        <section>
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <span className="bg-gradient-to-r from-green-400 to-green-600 bg-clip-text text-transparent">
              Trusted Devices
            </span>
            <span className="ml-3 px-3 py-1 text-xs rounded-full bg-green-900/50 text-green-300">
              {trustedDeviceList.length}
            </span>
          </h2>

          {trustedDeviceList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {trustedDeviceList.map((device, index) => (
                <DeviceCard
                  key={index}
                  device={device}
                  onToggleTrust={toggleDeviceTrust}
                  isTrusted={true}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  ></path>
                </svg>
              }
              title="No trusted devices"
              description="Add devices to your trusted list"
            />
          )}
        </section>

        {/* Untrusted Devices */}
        <section>
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <span className="bg-gradient-to-r from-pink-400 to-pink-600 bg-clip-text text-transparent">
              Untrusted Devices
            </span>
            <span className="ml-3 px-3 py-1 text-xs rounded-full bg-pink-900/50 text-pink-300">
              {untrustedDeviceList.length}
            </span>
          </h2>

          {untrustedDeviceList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {untrustedDeviceList.map((device, index) => (
                <DeviceCard
                  key={index}
                  device={device}
                  onToggleTrust={toggleDeviceTrust}
                  isTrusted={false}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  ></path>
                </svg>
              }
              title="No threats detected"
              description="All connected devices are trusted"
            />
          )}
        </section>
      </div>
    </div>
  );
};
