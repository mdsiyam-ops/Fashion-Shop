import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallbackLabel,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setResolvedSrc(src);
    setHasError(false);
  }, [src]);

  const handleImgError = () => {
    if (resolvedSrc.startsWith('/src/assets/')) {
      setResolvedSrc(`.${resolvedSrc}`);
      return;
    }
    setHasError(true);
  };

  if (hasError || !resolvedSrc) {
    return (
      <div
        className="w-full h-full bg-gradient-to-br from-zinc-100 via-zinc-50 to-zinc-200 flex flex-col items-center justify-center p-4 text-center"
        role="img"
        aria-label={alt}
      >
        <Package className="w-8 h-8 text-zinc-400 mb-2" strokeWidth={1.5} />
        <span className="text-xs font-medium text-zinc-500 line-clamp-2 max-w-[180px]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleImgError}
      className={className}
    />
  );
};
