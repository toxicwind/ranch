import { describe, expect, test } from "bun:test";
import ffs, { Option, Either, TaskIO } from "../src/index";

describe("FFS Monad Library (@ranch/ffs-monad)", () => {
  test("Option monad conforms to Functor and Monad laws", () => {
    const opt = Option.some(42);
    expect(opt.isDefined()).toBe(true);
    expect(opt.map((x) => x * 2).getOrElse(0)).toBe(84);

    const none = Option.fromNullable(null);
    expect(none.isEmpty()).toBe(true);
    expect(none.map((x) => x * 2).getOrElse(100)).toBe(100);
  });

  test("Either monad handles success and failure partitions", () => {
    const right = Either.right<number, string>(100);
    const mapped = right.map((x) => x + 23);
    expect(mapped.fold((_l) => 0, (r) => r)).toBe(123);

    const left = Either.left<string, number>("error occurred");
    expect(left.fold((l) => l, (_r) => "")).toBe("error occurred");
  });

  test("TaskIO monad maps and flatMaps lazily without early execution", async () => {
    let executed = false;
    const task = TaskIO.succeed(10)
      .tap(() => {
        executed = true;
      })
      .map((x) => x * 5);

    expect(executed).toBe(false);
    const result = await task.unsafeRun();
    expect(executed).toBe(true);
    expect(result).toBe(50);
  });

  test("FfsMonad queries grep and symbols over estate root", async () => {
    const client = ffs({ root: "/home/toxic/estate/config" });

    const grepTask = client.grep("COYOTE_PORT", { limit: 5 });
    const response = await grepTask.unsafeRun();

    expect(response.needle).toBe("COYOTE_PORT");
    expect(response.hits.length).toBeGreaterThan(0);
    expect(response.hits[0].path).toContain("ports.env");
  });

  test("FfsMonad handles pipeline composition via flatMap", async () => {
    const client = ffs({ root: "/home/toxic/estate" });

    // Monadic query chain: grep -> extract hit -> read outline
    const pipeline = client
      .grep("COYOTE_PORT", { limit: 1 })
      .flatMap((res) => {
        const firstHit = res.hits[0];
        if (!firstHit) {
          return TaskIO.fail(new Error("No hits found"));
        }
        return client.read(firstHit.path, { budget: 500 });
      });

    const output = await pipeline.attempt();
    expect(output.isRight()).toBe(true);
  });
});
