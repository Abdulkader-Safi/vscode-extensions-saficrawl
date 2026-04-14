import React from "react";

interface Props {
  title: string;
  description: string;
}

export const PagePlaceholder: React.FC<Props> = ({ title, description }) => (
  <div className="p-6">
    <h1 className="text-lg font-semibold">{title}</h1>
    <p className="mt-1 text-sm text-[color:var(--color-sc-text-dim)]">
      {description}
    </p>
  </div>
);
