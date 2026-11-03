
// ── Journal entries ──────────────────────────────────────────────────────────

function listJournalEntries(query?: { q?: string | null; tag?: string | null; linked?: string | null; mood?: string | null; sort?: string | null }): JournalListResponse {
  let rows = [...journalEntries];
  if (query?.q) {
    const needle = query.q.toLowerCase();
    rows = rows.filter((entry) => entry.title.toLowerCase().includes(needle) || entry.body.toLowerCase().includes(needle));
  }
  if (query?.tag) rows = rows.filter((entry) => entry.tags.includes(query.tag!));
  if (query?.linked === "linked") rows = rows.filter((entry) => entry.relatedTradeId !== null);
  if (query?.linked === "unlinked") rows = rows.filter((entry) => entry.relatedTradeId === null);
  if (query?.mood) rows = rows.filter((entry) => entry.mood === query.mood);
  const sort = query?.sort ?? "newest";
  rows.sort((a, b) =>
    sort === "oldest" ? a.date.localeCompare(b.date)
    : sort === "title" ? a.title.localeCompare(b.title)
    : b.date.localeCompare(a.date),
  );
  return { entries: rows, total: rows.length };
}

function createJournalEntry(input: CreateJournalEntryInput): JournalEntry {
  const entry: JournalEntry = {
    id: `jrn_${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    title: input.title,
    body: input.body,
    tags: input.tags ?? [],
    mood: input.mood ?? null,
    relatedTradeId: input.relatedTradeId ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  journalEntries.unshift(entry);
  return entry;
}

function updateJournalEntry(entryId: string, input: UpdateJournalEntryInput): JournalEntry {
  const entry = journalEntries.find((e) => e.id === entryId);
  if (!entry) throw new MockError(404, "Journal entry not found");
  if (input.title !== undefined) entry.title = input.title;
  if (input.body !== undefined) entry.body = input.body;
  if (input.tags !== undefined) entry.tags = input.tags;
  if (input.mood !== undefined) entry.mood = input.mood;
  if (input.relatedTradeId !== undefined) entry.relatedTradeId = input.relatedTradeId;
  entry.updatedAt = new Date().toISOString();
  return entry;
}

function deleteJournalEntry(entryId: string): { id: string; deleted: boolean } {
  const index = journalEntries.findIndex((e) => e.id === entryId);
  if (index === -1) throw new MockError(404, "Journal entry not found");
  journalEntries.splice(index, 1);
  return { id: entryId, deleted: true };
}

// ── Security ─────────────────────────────────────────────────────────────────

function getSecurityOverview(): SecurityOverview {
  return {
    twoFactorEnabled: securityState.twoFactorEnabled,
    passwordLastChangedAt: securityState.passwordLastChangedAt,
    sessions: securityState.sessions,
    logins: securityState.logins,
    recommendations: securityState.recommendations,
  };
}

function changePassword(_input: ChangePasswordInput): ChangePasswordResponse {
  securityState.passwordLastChangedAt = new Date().toISOString();
  return { passwordLastChangedAt: securityState.passwordLastChangedAt };
}

function toggleTwoFactor(): TwoFactorToggleResponse {
  securityState.twoFactorEnabled = !securityState.twoFactorEnabled;
  return { twoFactorEnabled: securityState.twoFactorEnabled };
}

function revokeSession(sessionId: string): RevokeSessionResponse {
  const index = securityState.sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) throw new MockError(404, "Session not found");
  if (securityState.sessions[index]!.current) throw new MockError(409, "The current session cannot be revoked - sign out instead.");
  securityState.sessions.splice(index, 1);
  return { id: sessionId, revoked: true };
}

function securityLog(): SecurityLogResponse {
  const events: SecurityEvent[] = [
    { id: "sev_1", type: "security", label: "Password changed", detail: null, createdAt: securityState.passwordLastChangedAt },
    { id: "sev_2", type: "security", label: "Sign-in from Lisbon failed", detail: "Unknown device · Linux", createdAt: daysAgoIso(3.4) },
    { id: "sev_3", type: "trade", label: `Trade captured - ${symbolOf(data.trades[data.trades.length - 1]!)}`, detail: "Session runner", createdAt: daysAgoIso(0.1) },
    { id: "sev_4", type: "grade", label: "Decision graded A", detail: "Pre-decision gate respected", createdAt: daysAgoIso(0.5) },
    { id: "sev_5", type: "system", label: "Nightly backup completed", detail: "JSON snapshot, 412 KB", createdAt: daysAgoIso(1) },
  ];
  return { events: events.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
}

// ── Social / community ───────────────────────────────────────────────────────

function socialOverview(period: SocialPeriod): SocialOverviewResponse {
  const leaderboard: SocialLeaderboardRow[] = socialTraders.map((trader, index) => ({
    traderId: trader.id,
    handle: trader.handle,
    displayName: trader.displayName,
    avatarHue: trader.avatarHue,
    assetFocus: trader.assetFocus,
    isMe: false,
    isFollowing: followedTraders.has(trader.id),
    netPnlPct: toDecimalString(round2(12.4 - index * 2.7)),
    winRate: toDecimalString(round2(61 - index * 3.1)),
    avgR: toDecimalString(round2(0.42 - index * 0.06)),
    disciplineScore: toDecimalString(round2(88 - index * 4)),
    trades: 214 - index * 31,
    bestStreak: 12 - index,
  }));
  const posts = socialPostsState
    .filter((post) => (period === "WEEK" ? Date.parse(post.createdAt) > Date.now() - 7 * DAY_MS : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { period, me: socialMeState, leaderboard, posts };
}

function getSocialMe(): SocialMe {
  return socialMeState;
}

function updateSocialMe(input: UpdateSocialMeInput): SocialMe {
  if (input.handle !== undefined) socialMeState.handle = input.handle;
  if (input.isPublic !== undefined) {
    socialMeState.isPublic = input.isPublic;
    socialMeState.publishedAt = input.isPublic ? new Date().toISOString() : null;
  }
  return socialMeState;
}

function createSocialPost(input: CreateSocialPostInput): SocialPost {
  const post: SocialPost = {
    id: `sp_${Math.random().toString(36).slice(2, 8)}`,
    traderId: "me",
    handle: socialMeState.handle,
    displayName: socialMeState.displayName,
    avatarHue: 25,
    kind: input.kind,
    text: input.text,
    isFollowing: false,
    symbol: input.symbol ?? null,
    direction: input.direction ?? null,
    rMultiple: input.rMultiple ?? null,
    pnl: input.pnl ?? null,
    likes: 0,
    likedByMe: false,
    comments: 0,
    createdAt: new Date().toISOString(),
  };
  socialPostsState.unshift(post);
  return post;
}

function toggleSocialPostLike(postId: string): ToggleLikeResponse {
  const post = socialPostsState.find((p) => p.id === postId);
  if (!post) throw new MockError(404, "Post not found");
  post.likedByMe = !post.likedByMe;
  post.likes += post.likedByMe ? 1 : -1;
  return { id: post.id, likes: post.likes, likedByMe: post.likedByMe };
}

function toggleSocialFollow(traderId: string): ToggleFollowResponse {
  const trader = socialTraders.find((t) => t.id === traderId);
  if (!trader) throw new MockError(404, "Trader not found");
  const following = !followedTraders.has(traderId);
  if (following) followedTraders.add(traderId);
  else followedTraders.delete(traderId);
  return { traderId, following, followers: trader.followers + (following ? 1 : 0) };
}

// ── System health + system integrations ──────────────────────────────────────

function getSystemHealth(): SystemHealth {
  return buildSystemHealth();
}

function listSystemIntegrations(): IntegrationsCatalogResponse {
  return { integrations: systemIntegrationsState };
}

function toggleSystemIntegration(integrationId: string): ToggleIntegrationResponse {
  const integration = systemIntegrationsState.find((i) => i.id === integrationId);
  if (!integration) throw new MockError(404, "Integration not found");
  if (integration.status === "connected") {
    integration.status = "disconnected";
    integration.connectedAt = null;
  } else {
    integration.status = "connected";
    integration.connectedAt = new Date().toISOString();
  }
  return { id: integration.id, status: integration.status, connectedAt: integration.connectedAt };
}
