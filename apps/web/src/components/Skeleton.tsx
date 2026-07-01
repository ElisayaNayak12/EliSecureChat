interface SkeletonProps {
  type?: "avatar" | "line" | "chat-item" | "message";
  count?: number;
}

export default function Skeleton({ type = "line", count = 1 }: SkeletonProps) {
  const renderSkeleton = () => {
    switch (type) {
      case "avatar":
        return <div className="skeleton skeleton-avatar animate-pulse" />;
      case "chat-item":
        return (
          <div className="skeleton-chat-item animate-pulse">
            <div className="skeleton skeleton-avatar" />
            <div className="skeleton-chat-item-lines">
              <div className="skeleton skeleton-line w-3/4" style={{ width: "60%" }} />
              <div className="skeleton skeleton-line w-1/2" style={{ width: "40%" }} />
            </div>
          </div>
        );
      case "message":
        return (
          <div className="skeleton-message animate-pulse">
            <div className="skeleton skeleton-line" style={{ width: "70%" }} />
            <div className="skeleton skeleton-line" style={{ width: "30%", marginTop: "6px" }} />
          </div>
        );
      case "line":
      default:
        return <div className="skeleton skeleton-line animate-pulse" />;
    }
  };

  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index}>{renderSkeleton()}</div>
      ))}
    </>
  );
}
