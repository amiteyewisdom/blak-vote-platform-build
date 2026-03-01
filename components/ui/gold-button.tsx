import * as React from 'react'
import { Button } from './button'

export default function GoldButton(props: React.ComponentProps<typeof Button>) {
  return <Button {...props} variant="premium" />
}
