import React from "react";

interface NotesIconProps {
  size?: number;
  fill?: string;
  width?: number;
  height?: number;
}

export const NotesIcon: React.FC<NotesIconProps> = ({
  size = 24,
  fill = "currentColor",
  width,
  height,
  ...props
}) => {
  return (
    <svg
      width={width || size}
      height={height || size}
      viewBox="0 0 24 24"
      fill={fill}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M13 3L18 8V21C18 21.5523 17.5523 22 17 22H7C6.44772 22 6 21.5523 6 21V4C6 3.44772 6.44772 3 7 3H13ZM13 9H18L13 4V9Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9 12H15M9 15H15M9 18H12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};