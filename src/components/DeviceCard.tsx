import { UsbDeviceInfo } from "../types";

interface DeviceCardProps {
  device: UsbDeviceInfo;
  onToggleTrust: (device: UsbDeviceInfo) => void;
  isTrusted: boolean;
}

export const DeviceCard = ({
  device,
  onToggleTrust,
  isTrusted,
}: DeviceCardProps) => {
  return (
    <div
      className={`p-5 rounded-xl transition-all duration-300 hover:shadow-lg ${
        isTrusted
          ? "bg-gray-800/50 border-l-4 border-green-500 hover:border-green-400"
          : "bg-gray-800/50 border-l-4 border-pink-500 hover:border-pink-400"
      } border-gray-700/50 hover:bg-gray-800/70`}
    >
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-lg font-medium truncate">
          {device.product || "Unknown Device"}
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            isTrusted
              ? "bg-green-900/30 text-green-400"
              : "bg-pink-900/30 text-pink-400"
          }`}
        >
          {isTrusted ? "Trusted" : "Untrusted"}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-300 mb-4">
        <div className="flex">
          <span className="w-24 text-gray-500">Vendor ID:</span>
          <span className="font-mono">
            0x{device.vendor_id.toString(16).padStart(4, "0")}
          </span>
        </div>
        <div className="flex">
          <span className="w-24 text-gray-500">Product ID:</span>
          <span className="font-mono">
            0x{device.product_id.toString(16).padStart(4, "0")}
          </span>
        </div>
        {device.manufacturer && (
          <div className="flex">
            <span className="w-24 text-gray-500">Manufacturer:</span>
            <span className="truncate">{device.manufacturer}</span>
          </div>
        )}
        {device.serial_number && (
          <div className="flex">
            <span className="w-24 text-gray-500">Serial:</span>
            <span className="font-mono truncate">{device.serial_number}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => onToggleTrust(device)}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
          isTrusted
            ? "bg-pink-900/50 hover:bg-pink-900/70 text-pink-300 hover:text-pink-200"
            : "bg-green-900/50 hover:bg-green-900/70 text-green-300 hover:text-green-200"
        }`}
      >
        {isTrusted ? "Revoke Trust" : "Grant Trust"}
      </button>
    </div>
  );
};
