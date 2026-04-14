export class RingBuffer<T> {
  private readonly data: T[] = [];

  constructor(private readonly cap: number) {}

  push(item: T): void {
    this.data.push(item);
    if (this.data.length > this.cap)
      {this.data.splice(0, this.data.length - this.cap);}
  }

  pushMany(items: Iterable<T>): void {
    for (const item of items) {this.data.push(item);}
    if (this.data.length > this.cap)
      {this.data.splice(0, this.data.length - this.cap);}
  }

  snapshot(): T[] {
    return this.data.slice();
  }

  clear(): void {
    this.data.length = 0;
  }

  get size(): number {
    return this.data.length;
  }
}
