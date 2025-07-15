interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export const EmptyState = ({ icon, title, description }: EmptyStateProps) => {
  return (
    <div className="p-8 text-center rounded-xl bg-gray-800/30 border border-dashed border-gray-700">
      <div className="w-12 h-12 mx-auto text-gray-500">{icon}</div>
      <h3 className="mt-4 text-lg font-medium text-gray-400">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
};
