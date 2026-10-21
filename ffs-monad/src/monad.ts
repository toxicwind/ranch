/**
 * Monad core: Option and Either (Scala/Haskell algebraic data types)
 */

export type Option<T> = Some<T> | None;

export class Some<T> {
  readonly _tag = "Some" as const;
  constructor(readonly value: T) {}

  isDefined(): this is Some<T> {
    return true;
  }
  isEmpty(): this is None {
    return false;
  }

  map<U>(f: (val: T) => U): Option<U> {
    return new Some(f(this.value));
  }

  flatMap<U>(f: (val: T) => Option<U>): Option<U> {
    return f(this.value);
  }

  getOrElse<U>(_def: U): T {
    return this.value;
  }

  fold<U>(_ifEmpty: () => U, ifSome: (val: T) => U): U {
    return ifSome(this.value);
  }
}

export class None {
  readonly _tag = "None" as const;

  isDefined(): this is Some<never> {
    return false;
  }
  isEmpty(): this is None {
    return true;
  }

  map<U>(_f: (val: never) => U): Option<U> {
    return this;
  }

  flatMap<U>(_f: (val: never) => Option<U>): Option<U> {
    return this;
  }

  getOrElse<U>(def: U): U {
    return def;
  }

  fold<U>(ifEmpty: () => U, _ifSome: (val: never) => U): U {
    return ifEmpty();
  }
}

export const Option = {
  some: <T>(val: T): Option<T> => new Some(val),
  none: (): Option<never> => new None(),
  fromNullable: <T>(val: T | null | undefined): Option<NonNullable<T>> =>
    val === null || val === undefined ? new None() : new Some(val as NonNullable<T>),
};

export type Either<L, R> = Left<L, R> | Right<L, R>;

export class Left<L, R> {
  readonly _tag = "Left" as const;
  constructor(readonly value: L) {}

  isLeft(): this is Left<L, R> {
    return true;
  }
  isRight(): this is Right<L, R> {
    return false;
  }

  map<U>(_f: (r: R) => U): Either<L, U> {
    return this as unknown as Either<L, U>;
  }

  flatMap<U>(_f: (r: R) => Either<L, U>): Either<L, U> {
    return this as unknown as Either<L, U>;
  }

  fold<U>(onLeft: (l: L) => U, _onRight: (r: R) => U): U {
    return onLeft(this.value);
  }
}

export class Right<L, R> {
  readonly _tag = "Right" as const;
  constructor(readonly value: R) {}

  isLeft(): this is Left<L, R> {
    return false;
  }
  isRight(): this is Right<L, R> {
    return true;
  }

  map<U>(f: (r: R) => U): Either<L, U> {
    return new Right(f(this.value));
  }

  flatMap<U>(f: (r: R) => Either<L, U>): Either<L, U> {
    return f(this.value);
  }

  fold<U>(_onLeft: (l: L) => U, onRight: (r: R) => U): U {
    return onRight(this.value);
  }
}

export const Either = {
  left: <L, R = never>(val: L): Either<L, R> => new Left(val),
  right: <R, L = never>(val: R): Either<L, R> => new Right(val),
  fromTry: <R, L = Error>(thunk: () => R): Either<L, R> => {
    try {
      return new Right(thunk());
    } catch (e: any) {
      return new Left(e as L);
    }
  },
};

/**
 * IO / Task Monad (ZIO / Cats Effect / Haskell IO style)
 * Encapsulates lazy, composable, failure-resilient side-effects.
 */
export class TaskIO<T> {
  constructor(readonly run: () => Promise<Either<Error, T>>) {}

  static succeed<T>(val: T): TaskIO<T> {
    return new TaskIO(async () => Either.right(val));
  }

  static fail<T = never>(err: Error): TaskIO<T> {
    return new TaskIO(async () => Either.left(err));
  }

  static fromPromise<T>(thunk: () => Promise<T>): TaskIO<T> {
    return new TaskIO(async () => {
      try {
        const res = await thunk();
        return Either.right(res);
      } catch (err: any) {
        return Either.left(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  map<U>(f: (val: T) => U): TaskIO<U> {
    return new TaskIO(async () => {
      const res = await this.run();
      return res.map(f);
    });
  }

  flatMap<U>(f: (val: T) => TaskIO<U>): TaskIO<U> {
    return new TaskIO(async () => {
      const res = await this.run();
      if (res.isLeft()) {
        return Either.left(res.value);
      }
      return f(res.value).run();
    });
  }

  tap(effect: (val: T) => void | Promise<void>): TaskIO<T> {
    return this.flatMap((val) =>
      TaskIO.fromPromise(async () => {
        await effect(val);
        return val;
      })
    );
  }

  attempt(): Promise<Either<Error, T>> {
    return this.run();
  }

  async unsafeRun(): Promise<T> {
    const res = await this.run();
    return res.fold(
      (err) => {
        throw err;
      },
      (val) => val
    );
  }
}
