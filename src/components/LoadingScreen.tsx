export const LoadingScreen = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900">
      <div className="relative">
        <div className="w-20 h-20 border-4 border-cyan-400 rounded-full animate-pulse"></div>
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-pink-500 animate-spin"></div>
      </div>
      <h2 className="mt-6 text-2xl font-light text-cyan-200 animate-pulse">
        Initializing UShield...
      </h2>
    </div>
  );
};
