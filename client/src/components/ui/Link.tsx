import { type AnchorHTMLAttributes, type ReactNode, forwardRef } from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom'
import { cn } from '../../lib/cn'

const baseClassName = 'text-secondary-400 hover:underline'

type CommonProps = {
  className?: string
  children?: ReactNode
}

type ExternalLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'> & {
    href: string
    to?: never
    /** When true (default), opens in a new tab with rel="noopener noreferrer". */
    external?: boolean
  }

type InternalLinkProps = CommonProps &
  Omit<RouterLinkProps, 'to' | 'className' | 'children'> & {
    to: RouterLinkProps['to']
    href?: never
    external?: never
  }

export type LinkProps = ExternalLinkProps | InternalLinkProps

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(props, ref) {
  const className = cn(baseClassName, props.className)

  if ('to' in props && props.to !== undefined) {
    const { to, className: _c, children, ...rest } = props
    return (
      <RouterLink ref={ref} to={to} className={className} {...rest}>
        {children}
      </RouterLink>
    )
  }

  const { href, external = true, className: _c, children, target, rel, ...rest } = props
  return (
    <a
      ref={ref}
      href={href}
      className={className}
      target={external ? '_blank' : target}
      rel={external ? 'noopener noreferrer' : rel}
      {...rest}
    >
      {children}
    </a>
  )
})

Link.displayName = 'Link'
