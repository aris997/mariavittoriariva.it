import type { Lang } from './data'
import type { Content } from './types'
import { en } from './en'
import { it } from './it'
import { ja } from './ja'

export const content: Record<Lang, Content> = { en, it, ja }
