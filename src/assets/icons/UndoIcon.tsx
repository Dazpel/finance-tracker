import * as React from "react"
const UndoIcon = (props:any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    className="icon icon-tabler icon-tabler-arrow-back-up"
    {...props}
  >
    <path stroke="none" d="M0 0h24v24H0z" />
    <path d="m9 14-4-4 4-4" />
    <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
  </svg>
)
export default UndoIcon
