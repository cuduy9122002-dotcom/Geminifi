'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { createGoal } from '@/lib/goals/actions'

export function NewGoalDialog({ minDeadline }: { minDeadline: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [deadline, setDeadline] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = await createGoal({ name, target, deadline })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success('Goal created')
      setOpen(false)
      setName('')
      setTarget('')
      setDeadline('')
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" />}>
         <Plus className="size-3.5" />
  New goal
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
          <DialogDescription>
            Name it, set a target and a deadline. We&apos;ll work out how much you need to save each month.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="goal-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="goal-name"
              placeholder="e.g. Summer holiday"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="goal-target" className="text-sm font-medium">
              Target amount
            </label>
            <Input
              id="goal-target"
              inputMode="decimal"
              placeholder="e.g. 1.500"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="goal-deadline" className="text-sm font-medium">
              Deadline
            </label>
            <Input
              id="goal-deadline"
              type="date"
              min={minDeadline}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : 'Create goal'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}