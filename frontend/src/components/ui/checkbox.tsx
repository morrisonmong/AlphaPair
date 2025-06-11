import * as React from "react"

import { cn } from "@/lib/utils"

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

function Checkbox({ className, onCheckedChange, ...props }: CheckboxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onCheckedChange) {
      onCheckedChange(e.target.checked)
    }
  }

  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(
        "h-4 w-4 rounded border border-gray-300 bg-transparent text-primary focus:outline-none focus:ring-2 focus:ring-primary/50",
        className
      )}
      onChange={handleChange}
      {...props}
    />
  )
}

export { Checkbox } 