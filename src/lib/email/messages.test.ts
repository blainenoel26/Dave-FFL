import { describe, expect, it } from "vitest";
import { banterDigestEmail, reminderEmail, resultsEmail } from "./messages";

const url = "https://example.test";

describe("reminderEmail", () => {
  it("lists missing picks and the missing x2", () => {
    const email = reminderEmail({ ownerName: "Sam", weekLabel: "Week 5", picks: 6, hasDouble: false, url });
    expect(email.subject).toBe("Week 5: your lineup isn't finished");
    expect(email.text).toContain("You still need 2 of your 8 picks and your x2 pick for Week 5.");
    expect(email.text).toContain(`${url}/picks`);
  });

  it("mentions only the x2 when all picks are in", () => {
    const email = reminderEmail({ ownerName: "Sam", weekLabel: "Week 5", picks: 8, hasDouble: false, url });
    expect(email.text).toContain("You still need your x2 pick for Week 5.");
  });
});

describe("resultsEmail", () => {
  const results = [
    { ownerName: "Pat", place: 1, points: 140, payoutCents: 4000 },
    { ownerName: "Sam", place: 2, points: 120, payoutCents: 2800 },
    { ownerName: "Lee", place: 3, points: 90, payoutCents: 0 },
  ];

  it("names the winner and shows payouts and the owner's balance", () => {
    const email = resultsEmail({ ownerName: "Lee", weekLabel: "Week 4", results, yourNetCents: -4000, url });
    expect(email.subject).toBe("Week 4 results: Pat wins");
    expect(email.text).toContain("$40.00");
    expect(email.text).toContain("Your season balance: -$40.00.");
    expect(email.text).not.toMatch(/Lee\s+90\s+\$/);
  });
});

describe("banterDigestEmail", () => {
  it("counts the messages and shows them with authors", () => {
    const email = banterDigestEmail({
      ownerName: "Sam",
      lines: [{ author: "Pat", at: "Sun 4:12 PM ET", body: "Nice x2 on the kicker." }],
      url,
    });
    expect(email.subject).toBe("Dave FFL Banter: 1 new message");
    expect(email.text).toContain("Pat (Sun 4:12 PM ET):\nNice x2 on the kicker.");
    expect(email.text).toContain(`${url}/banter`);
  });

  it("shows only the latest 10 of a long day", () => {
    const lines = Array.from({ length: 14 }, (_, i) => ({ author: "Pat", at: "now", body: `msg ${i}` }));
    const email = banterDigestEmail({ ownerName: "Sam", lines, url });
    expect(email.text).toContain("14 new messages in Banter. The latest 10:");
    expect(email.text).not.toContain("msg 3\n");
    expect(email.text).toContain("msg 13");
  });
});
