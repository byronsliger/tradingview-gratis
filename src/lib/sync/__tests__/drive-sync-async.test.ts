import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WATCHLIST, useChartStore } from "@/lib/store/chart-store";
import { UNKNOWN_WATCHLIST_ACCOUNT_ERROR, useSyncStore } from "@/lib/store/sync-store";
import { DEFAULT_SECTION_ID, flattenWatchlist, type WatchlistSection } from "@/lib/store/watchlist-sections";
import type { DriveSyncDocument } from "../types";
import { buildSnapshot, connectDrive, startDriveSync, stopDriveSync, syncNow } from "../drive-sync";

const drive = vi.hoisted(() => ({
  find: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));
const auth = vi.hoisted(() => ({ email: vi.fn(), clear: vi.fn(), acquire: vi.fn(), token: "test-token" }));

vi.mock("../drive-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../drive-client")>()),
  findStateFileId: drive.find,
  downloadStateDocument: drive.download,
  uploadStateDocument: drive.upload,
}));
vi.mock("../google-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../google-auth")>()),
  getStoredToken: () => auth.token,
  fetchUserEmail: auth.email,
  clearStoredToken: auth.clear,
  acquireToken: auth.acquire,
}));

const initialChart = useChartStore.getState();
const initialSync = useSyncStore.getState();
const base: WatchlistSection[] = [{ id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT"] }];
const edited: WatchlistSection[] = [
  { id: "priority", name: "Priority", symbols: ["SOLUSDT"] },
  { id: DEFAULT_SECTION_ID, name: "Core", symbols: ["BTCUSDT"] },
];
let tokenSequence = 0;

function setWatchlist(sections: WatchlistSection[]): void {
  useChartStore.setState({ watchlistSections: sections, watchlist: flattenWatchlist(sections) });
}

function remote(sections: WatchlistSection[], updatedAt = 200): DriveSyncDocument {
  return {
    version: 2,
    updatedAt,
    state: { ...buildSnapshot(), watchlistSections: sections, watchlist: flattenWatchlist(sections) },
  };
}

function connectState(sections: WatchlistSection[], baseline: string | null = JSON.stringify(sections)): void {
  setWatchlist(sections);
  useSyncStore.setState({
    enabled: true,
    email: "user@example.com",
    syncedEmail: "user@example.com",
    fileId: "file",
    lastSyncedAt: 100,
    bootstrapped: true,
    watchlistDirty: false,
    watchlistBaseline: baseline,
    status: "off",
    error: null,
  });
}

beforeEach(() => {
  auth.token = `test-token-${++tokenSequence}`;
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: "visible" });
  drive.find.mockReset().mockResolvedValue("file");
  drive.download.mockReset();
  drive.upload.mockReset().mockResolvedValue("file");
  auth.email.mockReset().mockResolvedValue("user@example.com");
  auth.clear.mockReset();
  auth.acquire.mockReset().mockResolvedValue("selected-token");
});

afterEach(() => {
  stopDriveSync();
  useChartStore.setState(initialChart);
  useSyncStore.setState(initialSync);
  vi.unstubAllGlobals();
});

describe("Drive watchlist reconciliation", () => {
  it("retains the old account identity and dirty list in a legacy hydrated state", async () => {
    connectState(base);
    setWatchlist(edited);
    useSyncStore.setState({ syncedEmail: null }); // Older persisted state only had `email`.
    auth.email.mockResolvedValue("other@example.com");

    await connectDrive();

    expect(useSyncStore.getState().enabled).toBe(false);
    expect(useSyncStore.getState().syncedEmail).toBe("user@example.com");
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("rejects a stored token for B during legacy account A background sync", async () => {
    connectState(base);
    useSyncStore.setState({ syncedEmail: null });
    auth.email.mockResolvedValue("other@example.com");

    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("reauth"));

    expect(useSyncStore.getState().email).toBe("user@example.com");
    expect(auth.clear).toHaveBeenCalled();
    expect(drive.find).not.toHaveBeenCalled();
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("loads account B rather than legacy account A's clean local watchlist", async () => {
    connectState(edited);
    useSyncStore.setState({ syncedEmail: null });
    auth.email.mockResolvedValue("other@example.com");
    const other: WatchlistSection[] = [{ id: DEFAULT_SECTION_ID, name: "Other", symbols: ["ETHUSDT"] }];
    drive.find.mockResolvedValue("other-file");
    drive.download.mockResolvedValue(remote(other));

    await connectDrive();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));

    expect(useChartStore.getState().watchlistSections).toEqual(other);
    expect(useSyncStore.getState().fileId).toBe("other-file");
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("initializes empty account B from defaults, not a legacy account A list", async () => {
    connectState(edited);
    useSyncStore.setState({ syncedEmail: null });
    auth.email.mockResolvedValue("other@example.com");
    drive.find.mockResolvedValue(null);

    await connectDrive();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());

    expect(drive.upload.mock.calls[0][2].state.watchlistSections).toEqual([
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: DEFAULT_WATCHLIST },
    ]);
  });

  it("blocks automatic sync for a disconnected legacy list with unknowable account", async () => {
    setWatchlist(edited);
    useSyncStore.setState({ enabled: false, email: null, syncedEmail: null, fileId: null,
      lastSyncedAt: 0, bootstrapped: false, watchlistBaseline: null, watchlistDirty: false, status: "off" });

    await connectDrive();

    expect(useSyncStore.getState().error).toBe(UNKNOWN_WATCHLIST_ACCOUNT_ERROR);
    expect(useSyncStore.getState().status).toBe("off");
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    expect(auth.email).not.toHaveBeenCalled();
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("blocks background sync when legacy account provenance is unknown", () => {
    setWatchlist(edited);
    useSyncStore.setState({ enabled: true, email: null, syncedEmail: null, fileId: "legacy-file",
      lastSyncedAt: 100, bootstrapped: true, watchlistBaseline: null, watchlistDirty: false });

    startDriveSync();

    expect(useSyncStore.getState().status).toBe("error");
    expect(useSyncStore.getState().error).toBe(UNKNOWN_WATCHLIST_ACCOUNT_ERROR);
    expect(drive.find).not.toHaveBeenCalled();
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("imports an unknown-provenance local list only after explicit account selection", async () => {
    setWatchlist(edited);
    useSyncStore.setState({ enabled: false, email: null, syncedEmail: null, fileId: null,
      lastSyncedAt: 0, bootstrapped: false, watchlistBaseline: null, watchlistDirty: false, status: "off" });
    auth.email.mockResolvedValue("other@example.com");
    drive.find.mockResolvedValue("other-file");
    drive.download.mockResolvedValue(remote([
      { id: DEFAULT_SECTION_ID, name: "Other", symbols: ["ETHUSDT"] },
    ]));

    await connectDrive(true);
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());

    expect(auth.acquire).toHaveBeenCalledWith({ selectAccount: true });
    expect(drive.upload.mock.calls[0][2].state.watchlistSections).toEqual([
      edited[0], { ...edited[1], symbols: ["BTCUSDT", "ETHUSDT"] },
    ]);
  });

  it("imports the preserved local list to an empty account only after explicit selection", async () => {
    setWatchlist(edited);
    useSyncStore.setState({ enabled: false, email: null, syncedEmail: null, fileId: null,
      lastSyncedAt: 0, bootstrapped: false, watchlistBaseline: null, watchlistDirty: false });
    auth.email.mockResolvedValue("other@example.com");
    drive.find.mockResolvedValue(null);

    await connectDrive(true);
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());

    expect(auth.acquire).toHaveBeenCalledWith({ selectAccount: true });
    expect(drive.upload.mock.calls[0][2].state.watchlistSections).toEqual(edited);
  });

  it("refuses another Google account while previous-account edits are pending", async () => {
    connectState(base);
    setWatchlist(edited);
    useSyncStore.getState().disconnect();
    auth.email.mockResolvedValue("other@example.com");

    await connectDrive();

    expect(useSyncStore.getState().enabled).toBe(false);
    expect(useSyncStore.getState().syncedEmail).toBe("user@example.com");
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
    expect(useSyncStore.getState().error).toContain("cuenta anterior");
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    expect(drive.find).not.toHaveBeenCalled();
    expect(drive.upload).not.toHaveBeenCalled();
    expect(auth.clear).toHaveBeenCalledOnce();
  });

  it("loads the new account's remote watchlist rather than merging the old account's clean list", async () => {
    connectState(edited);
    useSyncStore.getState().disconnect();
    auth.email.mockResolvedValue("other@example.com");
    const other: WatchlistSection[] = [{ id: DEFAULT_SECTION_ID, name: "Other", symbols: ["ETHUSDT"] }];
    drive.find.mockResolvedValue("other-file");
    drive.download.mockResolvedValue(remote(other));

    await connectDrive();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));

    expect(useSyncStore.getState().fileId).toBe("other-file");
    expect(useChartStore.getState().watchlistSections).toEqual(other);
    expect(drive.upload).not.toHaveBeenCalled();
  });

  it("initializes an empty new account from defaults, not the old account's local watchlist", async () => {
    connectState(edited);
    useSyncStore.getState().disconnect();
    auth.email.mockResolvedValue("other@example.com");
    drive.find.mockResolvedValue(null);

    await connectDrive();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());

    const uploaded = drive.upload.mock.calls[0][2] as DriveSyncDocument;
    expect(uploaded.state.watchlistSections).toEqual([
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: DEFAULT_WATCHLIST },
    ]);
    expect(uploaded.state.watchlistSections).not.toEqual(edited);
  });

  it("keeps pending edits and the account baseline through explicit disconnect", () => {
    connectState(base);
    setWatchlist(edited);
    useSyncStore.getState().disconnect();
    const state = useSyncStore.getState();
    expect(state.enabled).toBe(false);
    expect(state.watchlistDirty).toBe(true);
    expect(state.watchlistBaseline).toBe(JSON.stringify(base));
    expect(state.syncedEmail).toBe("user@example.com");
    state.connect("user@example.com");
    expect(useSyncStore.getState().fileId).toBe("file");
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
  });

  it("preserves an edit made while the first remote download is pending and uploads it", async () => {
    connectState(base);
    let finishDownload!: (doc: DriveSyncDocument) => void;
    drive.download.mockImplementationOnce(() => new Promise((resolve) => { finishDownload = resolve; }))
      .mockResolvedValue(remote(base));
    startDriveSync();
    await vi.waitFor(() => expect(drive.download).toHaveBeenCalledTimes(1));
    setWatchlist(edited);
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
    finishDownload(remote(base));
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalled());
    expect(drive.upload.mock.calls[0][2].state.watchlistSections).toEqual(edited);
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));
    expect(useSyncStore.getState().watchlistDirty).toBe(false);
  });

  it("ignores a download from a stopped session and keeps subsequent offline edits", async () => {
    connectState(base);
    let finishDownload!: (doc: DriveSyncDocument) => void;
    drive.download.mockImplementationOnce(() => new Promise((resolve) => { finishDownload = resolve; }))
      .mockResolvedValue(remote(base));
    startDriveSync();
    await vi.waitFor(() => expect(drive.download).toHaveBeenCalledTimes(1));
    stopDriveSync();
    setWatchlist(edited);
    finishDownload(remote(base));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    expect(drive.upload).not.toHaveBeenCalled();
    startDriveSync();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalled());
    expect(drive.upload.mock.lastCall?.[2].state.watchlistSections).toEqual(edited);
  });

  it("keeps offline edits pending after a failed upload and retries on reconnect", async () => {
    connectState(base);
    drive.download.mockResolvedValue(remote(base));
    drive.upload.mockRejectedValueOnce(new Error("Drive unavailable")).mockResolvedValue("file");
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));
    stopDriveSync();
    setWatchlist(edited);
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("error"));
    expect(useSyncStore.getState().watchlistDirty).toBe(true);
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    stopDriveSync();
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));
    expect(drive.upload.mock.lastCall?.[2].state.watchlistSections).toEqual(edited);
    expect(useSyncStore.getState().watchlistDirty).toBe(false);
  });

  it("does not show synced until an edit made during upload is acknowledged", async () => {
    connectState(base);
    setWatchlist(edited);
    drive.download.mockResolvedValue(remote(base));
    let finishUpload!: (fileId: string) => void;
    drive.upload.mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve; }))
      .mockResolvedValue("file");
    startDriveSync();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledTimes(1));
    useChartStore.getState().renameWatchlistSection("priority", "Urgent");
    finishUpload("file");
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledTimes(2));
    expect(drive.upload.mock.calls[1][2].state.watchlistSections[0].name).toBe("Urgent");
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));
    expect(useSyncStore.getState().watchlistDirty).toBe(false);
  });

  it("never follows a failed manual pull with a whole-document push", async () => {
    connectState(base);
    drive.download.mockRejectedValue(new Error("Drive unavailable"));
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("error"));
    syncNow();
    await vi.waitFor(() => expect(drive.download).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(drive.upload).not.toHaveBeenCalled();
    expect(useSyncStore.getState().status).toBe("error");
  });

  it("preserves a newer remote watchlist when an unrelated chart change is pushed", async () => {
    connectState(base);
    let currentRemote = remote(base);
    drive.download.mockImplementation(async () => currentRemote);
    drive.upload.mockImplementation(async (_token, _fileId, doc: DriveSyncDocument) => {
      currentRemote = doc;
      return "file";
    });
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));
    currentRemote = remote(edited, 300);
    useChartStore.getState().setConfig({ rsi: 16 });
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalled(), { timeout: 4000 });
    expect(drive.upload.mock.lastCall?.[2].state.watchlistSections).toEqual(edited);
    expect(useChartStore.getState().watchlistSections).toEqual(edited);
    await new Promise((resolve) => setTimeout(resolve, 2800));
    expect(drive.upload).toHaveBeenCalledOnce();
  }, 10_000);

  it("does not schedule another push when a clean upload sees the same remote watchlist", async () => {
    connectState(base);
    drive.download.mockResolvedValue(remote(base));
    startDriveSync();
    await vi.waitFor(() => expect(useSyncStore.getState().status).toBe("synced"));

    syncNow();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 2800));

    expect(drive.upload).toHaveBeenCalledOnce();
    expect(useSyncStore.getState().status).toBe("synced");
  });

  it("merges legacy customized local sections without a baseline instead of replacing them", async () => {
    connectState(edited, null);
    drive.download.mockResolvedValue(remote([
      { id: DEFAULT_SECTION_ID, name: "Main", symbols: ["BTCUSDT", "ETHUSDT"] },
    ]));
    startDriveSync();
    await vi.waitFor(() => expect(drive.upload).toHaveBeenCalled());
    const saved = drive.upload.mock.lastCall?.[2].state.watchlistSections as WatchlistSection[];
    expect(saved.map((section) => section.name)).toEqual(["Priority", "Core"]);
    expect(saved[1].symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
  });
});
