type BrandLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showText?: boolean
  className?: string
  textClassName?: string
  centered?: boolean
}

const sizes = {
  sm: {
    mark: 'h-10 w-10',
    text: 'text-xl',
  },
  md: {
    mark: 'h-12 w-12',
    text: 'text-2xl',
  },
  lg: {
    mark: 'h-16 w-16',
    text: 'text-3xl',
  },
} as const

export default function BrandLogo({
  size = 'md',
  showText = true,
  className = '',
  textClassName = '',
  centered = false,
}: BrandLogoProps) {
  const config = sizes[size]

  return (
    <div className={`flex items-center gap-3.5 ${centered ? 'justify-center' : ''} ${className}`.trim()}>
      <span
        className={`relative overflow-hidden rounded-full bg-black ${config.mark}`}
        style={{ boxShadow: 'inset 0 0 0 3px #000, 0 10px 30px rgba(0,0,0,0.35)' }}
      >
        <img
          src="/logo.jpeg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[50%_31%] scale-[1.92]"
        />
        {/* Black ring overlay — covers any white JPEG edge */}
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: 'inset 0 0 0 3px #000' }}
          aria-hidden="true"
        />
        {/* Bottom bleed cover */}
        <span className="absolute bottom-0 left-0 right-0 h-[14%] bg-black" aria-hidden="true" />
      </span>

      {showText ? (
        <span className={`font-bold tracking-tight text-foreground ${config.text} ${textClassName}`.trim()}>
          BlakVote
        </span>
      ) : null}
    </div>
  )
}