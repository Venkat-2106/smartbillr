export default function BentoCard({
  children,
  colSpan,
  style,
  className = '',
  hover = true,
  padding = true,
  ...props
}) {
  return (
    <div
      className={`card ${hover ? 'card-hover' : ''} ${className}`}
      style={{
        gridColumn: colSpan ? `span ${colSpan}` : undefined,
        padding: padding ? '20px' : 0,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}
