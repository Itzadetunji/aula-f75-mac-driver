import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { createInterface } from 'node:readline'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

/** JSON-lines client for the Swift `f75-helper` process. */
export class HelperClient extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()

  constructor(private readonly binaryPath: string) {
    super()
  }

  get running() {
    return this.proc !== null
  }

  start() {
    if (this.proc) return
    const proc = spawn(this.binaryPath, [], { stdio: 'pipe' })
    this.proc = proc

    createInterface({ input: proc.stdout }).on('line', (line) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      if (typeof msg.event === 'string') {
        this.emit(msg.event, msg)
        return
      }
      const pending = this.pending.get(msg.id as number)
      if (!pending) return
      this.pending.delete(msg.id as number)
      if ('error' in msg) pending.reject(new Error(String(msg.error)))
      else pending.resolve(msg.result)
    })

    proc.stderr.on('data', (d) => console.error('[f75-helper]', d.toString()))
    proc.on('error', (err) => this.emit('failed', err))
    proc.on('exit', (code) => {
      this.proc = null
      for (const p of this.pending.values()) p.reject(new Error('Helper exited'))
      this.pending.clear()
      this.emit('exit', code)
    })
  }

  stop() {
    this.proc?.kill()
    this.proc = null
  }

  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.proc) return Promise.reject(new Error('Helper not running'))
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.proc!.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }
}
