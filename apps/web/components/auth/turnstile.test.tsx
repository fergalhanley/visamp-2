import { StrictMode, useEffect } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Turnstile } from "./turnstile";
import { SignInDialog } from "./sign-in-dialog";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
// Model Next's async Script lifecycle, including cached-script remounts.
vi.mock("next/script", () => ({
  default: function Script({ onReady }: { onReady: () => void }) {
    useEffect(() => {
      onReady();
    }, [onReady]);
    return null;
  },
}));

type Options = Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
let options: Options;
let renderWidget: ReturnType<typeof vi.fn>;
let removeWidget: ReturnType<typeof vi.fn>;
let ready: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-site-key");
  renderWidget = vi.fn((_container: HTMLElement, config: Options) => {
    options = config;
    return `widget-${renderWidget.mock.calls.length}`;
  });
  removeWidget = vi.fn();
  ready = vi.fn(() => {
    throw new Error("Remove async/defer before using turnstile.ready()");
  });
  window.turnstile = Object.assign(
    { render: renderWidget, remove: removeWidget },
    { ready },
  );
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  cleanup();
  delete window.turnstile;
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Turnstile async lifecycle", () => {
  it("renders after script load, cleans up, and remounts without calling ready", () => {
    const onToken = vi.fn();
    const view = render(
      <Turnstile key="first" siteKey="test" onToken={onToken} />,
    );
    act(() => options.callback("first-token"));
    expect(onToken).toHaveBeenLastCalledWith("first-token");
    view.rerender(<Turnstile key="second" siteKey="test" onToken={onToken} />);
    expect(removeWidget).toHaveBeenCalledWith("widget-1");
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(renderWidget).toHaveBeenCalledTimes(2);
    expect(ready).not.toHaveBeenCalled();
    act(() => options["expired-callback"]());
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("keeps a live widget after Strict Mode replays effects", () => {
    render(
      <StrictMode>
        <Turnstile siteKey="test" onToken={vi.fn()} />
      </StrictMode>,
    );
    expect(
      renderWidget.mock.calls.length - removeWidget.mock.calls.length,
    ).toBe(1);
    expect(ready).not.toHaveBeenCalled();
  });

  it("shows widget errors without crashing or issuing a token", () => {
    renderWidget.mockImplementation(() => {
      throw new Error("Widget failed");
    });
    const onToken = vi.fn();
    render(<Turnstile siteKey="test" onToken={onToken} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "security check couldn’t load",
    );
    expect(onToken).toHaveBeenLastCalledWith(null);
  });

  it("handles asynchronous widget failures and cleanup failures", () => {
    const onToken = vi.fn();
    const view = render(<Turnstile siteKey="test" onToken={onToken} />);
    act(() => {
      expect(options["error-callback"]()).toBe(true);
    });
    expect(screen.getByRole("alert")).toBeTruthy();
    removeWidget.mockImplementation(() => {
      throw new Error("Already removed");
    });
    expect(() => view.unmount()).not.toThrow();
    expect(onToken).toHaveBeenLastCalledWith(null);
  });
});

it("Create account and Forgot password remount CAPTCHA and call the existing auth flows", async () => {
  render(<SignInDialog open onOpenChange={vi.fn()} next="/account" />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  expect(
    screen.getByRole("heading", { name: "Create an account" }),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "creator@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "example-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "example-password" },
  });
  expect(
    screen.queryByRole("button", { name: "Continue with Google" }),
  ).toBeNull();
  const signUp = screen.getByRole("button", {
    name: "Sign up",
  }) as HTMLButtonElement;
  expect(signUp.disabled).toBe(true);
  act(() => options.callback("signup-token"));
  fireEvent.click(signUp);
  await waitFor(() =>
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "creator@example.com",
      password: "example-password",
      options: {
        captchaToken: "signup-token",
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=%2Faccount`,
      },
    }),
  );
  await screen.findByText(
    "Check your email to confirm your account before signing in.",
  );
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect(
    screen.getByRole("heading", { name: "Reset your password" }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  const reset = screen.getByRole("button", {
    name: "Send reset link",
  }) as HTMLButtonElement;
  expect(reset.disabled).toBe(true);
  act(() => options.callback("reset-token"));
  fireEvent.click(reset);
  await waitFor(() =>
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "creator@example.com",
      {
        captchaToken: "reset-token",
        redirectTo: `${window.location.origin}/auth/callback?next=%2Fauth%2Freset-password%3Fnext%3D%252Faccount`,
      },
    ),
  );
  await screen.findByText("Check your email for a password reset link.");
  fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
  expect(
    screen.getByRole("heading", { name: "Sign in to VisAmp" }),
  ).toBeTruthy();
  expect(ready).not.toHaveBeenCalled();
  expect(removeWidget.mock.calls.length).toBeGreaterThanOrEqual(4);
});

it("rejects mismatched passwords without submitting, then allows correction", async () => {
  render(<SignInDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "creator@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "example-password" },
  });
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "different-password" },
  });
  act(() => options.callback("signup-token"));
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
  expect(auth.signUp).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Confirm password"), {
    target: { value: "example-password" },
  });
  auth.signUp.mockResolvedValueOnce({
    error: { message: "Email service unavailable" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await screen.findByText("Email service unavailable");
  expect(screen.queryByText("Account created")).toBeNull();
  expect(screen.getByLabelText("Confirm password")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("recovers from a network failure without leaving signup pending", async () => {
  render(<SignInDialog open onOpenChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "creator@example.com" },
  });
  for (const label of ["Password", "Confirm password"]) {
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: "example-password" },
    });
  }
  act(() => options.callback("signup-token"));
  auth.signUp.mockRejectedValueOnce(new Error("Network down"));
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  await screen.findByText("Unable to connect. Please try again.");
  act(() => options.callback("retry-token"));
  expect(
    (screen.getByRole("button", { name: "Sign up" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
