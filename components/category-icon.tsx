import {
  Banknote,
  Car,
  CirclePlus,
  Clapperboard,
  Ellipsis,
  GraduationCap,
  HeartPulse,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Tag,
  Undo2,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

// Keys = the `icon` strings seeded in Step 1
const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  'shopping-basket': ShoppingBasket,
  car: Car,
  'shopping-bag': ShoppingBag,
  clapperboard: Clapperboard,
  'heart-pulse': HeartPulse,
  receipt: Receipt,
  'graduation-cap': GraduationCap,
  plane: Plane,
  ellipsis: Ellipsis,
  banknote: Banknote,
  'undo-2': Undo2,
  'circle-plus': CirclePlus,
}

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Tag
  return <Icon className={className} />
}