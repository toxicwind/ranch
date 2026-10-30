import { describe, test, expect } from "bun:test";
import {
  createBillboard,
  tickBillboard,
  selectBillboardItem,
  currentBillboardItem,
  type BillboardState,
} from "../src/billboard";

const item = (id: string, title: string) => ({ id: `prog-${id}` as any, title } as any);

describe("netflix-ux: billboard carousel", () => {
  test("createBillboard starts at startIndex or 0", () => {
    const s = createBillboard([item("a", "A"), item("b", "B")], { startIndex: 1 });
    expect(s.index).toBe(1);
    const s2 = createBillboard([item("a", "A")]);
    expect(s2.index).toBe(0);
  });

  test("createBillboard clamps out-of-range startIndex", () => {
    const s = createBillboard([item("a", "A")], { startIndex: 5 });
    expect(s.index).toBe(0);
  });

  test("createBillboard defaults autoplay true, interval 6000", () => {
    const s = createBillboard([item("a", "A")]);
    expect(s.autoplay).toBe(true);
    expect(s.intervalMs).toBe(6000);
  });

  test("tickBillboard advances item after interval", () => {
    const s = createBillboard([item("a", "A"), item("b", "B")], { intervalMs: 1000 });
    const t = tickBillboard(s, 1000);
    expect(t.index).toBe(1);
    expect(t.elapsedMs).toBe(0);
  });

  test("tickBillboard accumulates elapsed without crossing interval", () => {
    const s = createBillboard([item("a", "A"), item("b", "B")], { intervalMs: 1000 });
    const t = tickBillboard(s, 300);
    expect(t.index).toBe(0);
    expect(t.elapsedMs).toBe(300);
  });

  test("tickBillboard disabled when autoplay off", () => {
    const s = createBillboard([item("a", "A"), item("b", "B")], { autoplay: false });
    const t = tickBillboard(s, 10000);
    expect(t.index).toBe(0);
    expect(t.elapsedMs).toBe(10000);
  });

  test("tickBillboard empty items does nothing", () => {
    const s = createBillboard([], { intervalMs: 1000 });
    const t = tickBillboard(s, 5000);
    expect(t.index).toBe(0);
    expect(t.elapsedMs).toBe(0);
  });

  test("selectBillboardItem pauses autoplay and moves index", () => {
    const s = createBillboard([item("a", "A"), item("b", "B")], { autoplay: true });
    const t = selectBillboardItem(s, 1);
    expect(t.index).toBe(1);
    expect(t.autoplay).toBe(false);
  });

  test("selectBillboardItem ignores out-of-range index", () => {
    const s = createBillboard([item("a", "A")]);
    const t = selectBillboardItem(s, 9);
    expect(t.index).toBe(0);
  });

  test("currentBillboardItem returns current item", () => {
    const s = createBillboard([item("a", "Alpha"), item("b", "Beta")], { startIndex: 1 });
    expect(currentBillboardItem(s)?.title).toBe("Beta");
    expect(currentBillboardItem(createBillboard([]))).toBeUndefined();
  });
});
