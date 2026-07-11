// Top-up modal (CR-003 §3.2) — 3 steps in one dialog: pick a coin package,
// pick a provider, pay. Step 3 calls `useWallet().topup()`, which hits the
// `topup-create` Edge Function (§2.5) that reads the real price server-side —
// this file never sends a price, only a `package_id`. Crediting happens out of
// band via the `payment-webhook` Edge Fn + `credit_topup` RPC once Omise
// confirms payment; we just watch the `topup_orders` row (Realtime, with a
// manual "ตรวจสอบสถานะ" fallback per §2.6) and let `wallet.ts`'s own Realtime
// subscription on `wallets` pick up the resulting balance change.
//
// Stays mounted (parent controls visibility via `open`) so a pending order
// keeps being watched even while the dialog is closed — that's what powers
// the "รอชำระ 1 รายการ" badge exposed through `onPendingChange`.

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useWallet, type TopupResult } from "./wallet";

interface CoinPackage {
  id: string;
  title: string;
  coins: number;
  bonusCoins: number;
  priceSatang: number;
}

type CoinPackageRow = {
  id: string;
  title: string;
  coins: number | string;
  bonus_coins: number | string;
  price_satang: number | string;
};

type OrderStatus = "pending" | "paid" | "expired" | "failed";
type Provider = "promptpay" | "truemoney";

function errText(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e) ?? "เกิดข้อผิดพลาด";
}

function num(v: number | string): number {
  return typeof v === "number" ? v : Number(v);
}

function toPackage(row: CoinPackageRow): CoinPackage {
  return {
    id: row.id,
    title: row.title,
    coins: num(row.coins),
    bonusCoins: num(row.bonus_coins),
    priceSatang: num(row.price_satang),
  };
}

function formatBaht(satang: number): string {
  const baht = satang / 100;
  return baht.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function formatCountdown(sec: number): string {
  const clamped = Math.max(0, sec);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface TopupModalProps {
  open: boolean;
  onClose: () => void;
  /** Lets the parent (WalletTab) render a "รอชำระ 1 รายการ" badge even while
   *  this modal is hidden — CR-003 §3.2 "ปิด modal ระหว่างรอได้". */
  onPendingChange?: (pending: boolean) => void;
}

export default function TopupModal({ open, onClose, onPendingChange }: TopupModalProps) {
  const { topup } = useWallet();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<CoinPackage | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [order, setOrder] = useState<TopupResult | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  const wasOpen = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPackagesLoading(true);
      const { data, error } = await supabase
        .from("coin_packages")
        .select("id, title, coins, bonus_coins, price_satang")
        .eq("active", true)
        .order("sort", { ascending: true });
      if (cancelled) return;
      if (error) setMsg(errText(error));
      else setPackages(((data as CoinPackageRow[] | null) ?? []).map(toPackage));
      setPackagesLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Reset to a fresh flow on open, unless there's an in-flight order — then
  // jump straight back to the payment step so the user sees where they left off.
  useEffect(() => {
    if (open && !wasOpen.current) {
      if (orderStatus === "pending") {
        setStep(3);
      } else {
        setStep(1);
        setSelectedPackage(null);
        setProvider(null);
        setOrder(null);
        setOrderStatus(null);
        setMsg(null);
      }
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Countdown for the PromptPay QR (~15 min per §2.6).
  useEffect(() => {
    if (!order || orderStatus !== "pending" || provider !== "promptpay") return;
    const tick = () => {
      const left = Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000);
      setRemainingSec(left);
      if (left <= 0) {
        setOrderStatus("expired");
        onPendingChange?.(false);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [order, orderStatus, provider, onPendingChange]);

  // Realtime watch on the order row — keeps working while the modal is closed
  // since this effect only depends on order/orderStatus, not `open`.
  useEffect(() => {
    if (!order || orderStatus !== "pending") return;
    const channel = supabase
      .channel(`topup-${order.orderId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "topup_orders", filter: `id=eq.${order.orderId}` },
        (payload) => {
          const status = (payload.new as { status?: OrderStatus } | undefined)?.status;
          if (status === "paid" || status === "expired" || status === "failed") {
            setOrderStatus(status);
            onPendingChange?.(false);
          }
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [order, orderStatus, onPendingChange]);

  async function checkStatusNow() {
    if (!order) return;
    const { data, error } = await supabase.from("topup_orders").select("status").eq("id", order.orderId).maybeSingle();
    if (error) { setMsg(errText(error)); return; }
    const status = (data as { status?: OrderStatus } | null)?.status;
    if (status === "paid" || status === "expired" || status === "failed") {
      setOrderStatus(status);
      onPendingChange?.(false);
    }
  }

  async function startTopup(pkg: CoinPackage, prov: Provider) {
    setSubmitting(true);
    setMsg(null);
    try {
      const result = await topup(pkg.id, prov);
      setOrder(result);
      setOrderStatus("pending");
      setStep(3);
      onPendingChange?.(true);
      if (prov === "truemoney" && result.authorizeUri) {
        // Same "open the system browser" pattern auth.ts's signInWithGoogle uses.
        await invoke("open_url", { url: result.authorizeUri });
      }
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setSubmitting(false);
    }
  }

  function selectPackage(pkg: CoinPackage) {
    setSelectedPackage(pkg);
    setStep(2);
  }

  function selectProvider(prov: Provider) {
    setProvider(prov);
    if (selectedPackage) void startTopup(selectedPackage, prov);
  }

  function retry() {
    if (selectedPackage && provider) void startTopup(selectedPackage, provider);
  }

  function backToPackages() {
    setStep(1);
    setSelectedPackage(null);
    setProvider(null);
  }

  if (!open) return null;

  return (
    <div className="topup-overlay" onClick={onClose}>
      <div className="topup-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="topup-close" onClick={onClose} aria-label="ปิด">×</button>
        <div className="topup-step-label">ขั้นตอน {step} / 3</div>

        {step === 1 ? (
          <div className="topup-step">
            <h3 className="topup-h3">เลือกแพ็คเกจ</h3>
            {packagesLoading ? (
              <div className="topup-hint">กำลังโหลดแพ็คเกจ…</div>
            ) : (
              <div className="topup-package-grid">
                {packages.map((pkg, i) => (
                  <button
                    type="button"
                    key={pkg.id}
                    className={`topup-package-card${pkg.id === "coins_m" || (packages.length === 3 && i === 1) ? " best" : ""}`}
                    onClick={() => selectPackage(pkg)}
                  >
                    {pkg.id === "coins_m" || (packages.length === 3 && i === 1) ? (
                      <span className="topup-package-badge">คุ้มสุด</span>
                    ) : null}
                    <div className="topup-package-title">{pkg.title}</div>
                    <div className="topup-package-coins">
                      🪙 {pkg.coins.toLocaleString()}
                      {pkg.bonusCoins > 0 ? <span className="topup-package-bonus"> +{pkg.bonusCoins.toLocaleString()}</span> : null}
                    </div>
                    <div className="topup-package-price">฿{formatBaht(pkg.priceSatang)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="topup-step">
            <h3 className="topup-h3">เลือกช่องทาง</h3>
            <div className="topup-provider-grid">
              <button type="button" className="topup-provider-btn" disabled={submitting} onClick={() => selectProvider("promptpay")}>
                <span className="topup-provider-icon">🇶🇷</span> PromptPay
              </button>
              <button type="button" className="topup-provider-btn" disabled={submitting} onClick={() => selectProvider("truemoney")}>
                <span className="topup-provider-icon">🪪</span> TrueMoney
              </button>
            </div>
            <button type="button" className="topup-back-btn" onClick={backToPackages}>‹ ย้อนกลับ</button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="topup-step">
            <h3 className="topup-h3">ชำระเงิน</h3>
            {orderStatus === "paid" ? (
              <div className="topup-success">
                ✅ สำเร็จ! เหรียญเข้าบัญชีแล้ว<br />
                ขอบคุณที่เติมเหรียญนะ ❄
              </div>
            ) : orderStatus === "failed" ? (
              <div className="topup-error">
                การชำระเงินล้มเหลว
                <button type="button" className="topup-retry-btn" onClick={retry} disabled={submitting}>ลองใหม่</button>
              </div>
            ) : provider === "promptpay" ? (
              orderStatus === "expired" ? (
                <div className="topup-payment">
                  {order?.qrImageUri ? <img className="topup-qr expired" src={order.qrImageUri} alt="QR หมดอายุ" /> : null}
                  <div className="topup-hint">QR หมดอายุแล้ว</div>
                  <button type="button" className="topup-retry-btn" onClick={retry} disabled={submitting}>สร้าง QR ใหม่</button>
                </div>
              ) : (
                <div className="topup-payment">
                  {order?.qrImageUri ? <img className="topup-qr" src={order.qrImageUri} alt="สแกนจ่ายด้วย PromptPay" /> : null}
                  <div className="topup-countdown">{formatCountdown(remainingSec)}</div>
                  <div className="topup-pending-pulse">รอชำระ…</div>
                </div>
              )
            ) : (
              <div className="topup-payment">
                {orderStatus === "expired" ? (
                  <>
                    <div className="topup-hint">รายการหมดอายุแล้ว</div>
                    <button type="button" className="topup-retry-btn" onClick={retry} disabled={submitting}>ลองใหม่</button>
                  </>
                ) : (
                  <>
                    <div className="topup-spinner" aria-hidden="true" />
                    <div className="topup-hint">เปิดแอป TrueMoney ในเบราว์เซอร์แล้ว…</div>
                    <button type="button" className="topup-check-btn" onClick={() => void checkStatusNow()}>ตรวจสอบสถานะ</button>
                  </>
                )}
              </div>
            )}
            {orderStatus === "pending" ? (
              <div className="topup-hint small">ปิดหน้าต่างนี้ได้ — เราจะแจ้งเตือนเมื่อจ่ายสำเร็จ</div>
            ) : null}
          </div>
        ) : null}

        {msg ? <div className="topup-msg">{msg}</div> : null}
      </div>
    </div>
  );
}
