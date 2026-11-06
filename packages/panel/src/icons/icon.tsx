import type {ReactNode, SVGProps} from "react"

export type IconProps = SVGProps<SVGSVGElement>

/** Line drawing for the icons Heroicons lacks: 1.5px strokes match its 16px set's weight. */
export const stroked = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} satisfies IconProps

/** A 16px icon. The width and height attributes are a fallback: CSS sizes it where it's used. */
export const icon = (paths: ReactNode, drawing: IconProps = {fill: "currentColor"}) => {
  const Icon = (props: IconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      data-slot="icon"
      {...drawing}
      {...props}
    >
      {paths}
    </svg>
  )
  return Icon
}
