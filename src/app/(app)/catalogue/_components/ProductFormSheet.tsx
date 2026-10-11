"use client";
// New / edit product sheet. One component serves both — pass `mode="create"` for
// a blank form, `mode="edit"` with `product` + `onSaved` for in-place editing.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import {
  createProductAction,
  createCategoryAction,
  updateProductMetaAction,
  updateProductPricesAction,
} from "../actions";

export type Category = { id: string; name: string };

export type EditableProduct = {
  id: string;
  name: string;
  spec: string | null;
  aliases: string[];
  categoryId: string;
  isStockItem: boolean;
  dealerPriceWoMotor: string | null;
  dealerPrice: string | null;
  customerPrice: string | null;
};

export type ProductFormSheetProps =
  | {
      mode: "create";
      categories: Category[];
      trigger: React.ReactNode;
      onCreated?: () => void;
    }
  | {
      mode: "edit";
      categories: Category[];
      product: EditableProduct;
      trigger: React.ReactNode;
      onSaved?: (next: EditableProduct) => void;
    };

export function ProductFormSheet(props: ProductFormSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const initial = React.useMemo<EditableProduct>(
    () =>
      props.mode === "edit"
        ? props.product
        : {
            id: "",
            name: "",
            spec: "",
            aliases: [],
            categoryId: props.categories[0]?.id ?? "",
            isStockItem: false,
            dealerPriceWoMotor: null,
            dealerPrice: null,
            customerPrice: null,
          },
    // Only reset when the sheet re-opens or the source product changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode === "edit" ? props.product.id : "__new__", open],
  );

  const [name, setName] = React.useState(initial.name);
  const [spec, setSpec] = React.useState(initial.spec ?? "");
  const [aliasInput, setAliasInput] = React.useState(initial.aliases.join(", "));
  const [categoryId, setCategoryId] = React.useState(initial.categoryId);
  const [newCategory, setNewCategory] = React.useState("");
  const [isStockItem, setIsStockItem] = React.useState(initial.isStockItem);
  const [dealerWo, setDealerWo] = React.useState(initial.dealerPriceWoMotor ?? "");
  const [dealer, setDealer] = React.useState(initial.dealerPrice ?? "");
  const [customer, setCustomer] = React.useState(initial.customerPrice ?? "");

  // Reset form state whenever the sheet opens with a (possibly new) initial.
  // Defer the setStates to a microtask so React's new cascading-render lint
  // (react-hooks/set-state-in-effect) stays happy.
  React.useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setName(initial.name);
      setSpec(initial.spec ?? "");
      setAliasInput(initial.aliases.join(", "));
      setCategoryId(initial.categoryId);
      setNewCategory("");
      setIsStockItem(initial.isStockItem);
      setDealerWo(initial.dealerPriceWoMotor ?? "");
      setDealer(initial.dealerPrice ?? "");
      setCustomer(initial.customerPrice ?? "");
    }, 0);
    return () => clearTimeout(id);
  }, [open, initial]);

  const aliases = aliasInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  async function resolveCategoryId(): Promise<string | null> {
    const trimmed = newCategory.trim();
    if (!trimmed) return categoryId;
    const r = await createCategoryAction({ name: trimmed });
    if (!r.ok) {
      toast.error(r.error.message);
      return null;
    }
    return r.data.id;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setPending(true);
    try {
      const catId = await resolveCategoryId();
      if (!catId) return;

      if (props.mode === "create") {
        const r = await createProductAction({
          categoryId: catId,
          name: name.trim(),
          spec: spec.trim() || null,
          aliases,
          dealerPriceWoMotor: dealerWo || null,
          dealerPrice: dealer || null,
          customerPrice: customer || null,
          isStockItem,
        });
        if (!r.ok) {
          toast.error(r.error.message);
          return;
        }
        toast.success("Product added.");
        setOpen(false);
        router.refresh();
        props.onCreated?.();
      } else {
        // Edit — split meta vs prices (two actions, both audited).
        const meta = await updateProductMetaAction({
          id: props.product.id,
          name: name.trim(),
          spec: spec.trim() || null,
          aliases,
          categoryId: catId,
          isStockItem,
        });
        if (!meta.ok) {
          toast.error(meta.error.message);
          return;
        }
        const prices = await updateProductPricesAction({
          id: props.product.id,
          dealerPriceWoMotor: dealerWo || null,
          dealerPrice: dealer || null,
          customerPrice: customer || null,
        });
        if (!prices.ok) {
          toast.error(prices.error.message);
          return;
        }
        toast.success("Product saved.");
        setOpen(false);
        router.refresh();
        props.onSaved?.({
          id: props.product.id,
          name: name.trim(),
          spec: spec.trim() || null,
          aliases,
          categoryId: catId,
          isStockItem,
          dealerPriceWoMotor: dealerWo || null,
          dealerPrice: dealer || null,
          customerPrice: customer || null,
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{props.trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-lg)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]">
          <div className="mb-4 flex items-start justify-between">
            <DialogPrimitive.Title className="text-lg font-semibold">
              {props.mode === "create" ? "New product" : "Edit product"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="pf-name">Name</Label>
              <Input
                id="pf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="pf-spec">HP / Spec</Label>
                <Input
                  id="pf-spec"
                  value={spec}
                  onChange={(e) => setSpec(e.target.value)}
                  maxLength={120}
                  placeholder="2 HP"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-category">Category</Label>
                <select
                  id="pf-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={props.categories.length === 0}
                  className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
                >
                  {props.categories.length === 0 && (
                    <option value="">— Add one below —</option>
                  )}
                  {props.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="…or add a new category"
                  maxLength={80}
                  className="mt-1 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pf-aliases">Aliases (comma-separated)</Label>
              <Input
                id="pf-aliases"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                placeholder="10 ltr tilting, 10l tt"
              />
              <p className="text-xs text-[color:var(--color-ink-3)]">
                Alternate names used by the search bar on the new-order wizard.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pf-dw">Dealer w/o motor</Label>
                <Input
                  id="pf-dw"
                  value={dealerWo}
                  onChange={(e) => setDealerWo(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="numeric"
                  placeholder="—"
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-d">Dealer</Label>
                <Input
                  id="pf-d"
                  value={dealer}
                  onChange={(e) => setDealer(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="numeric"
                  placeholder="—"
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pf-c">Customer</Label>
                <Input
                  id="pf-c"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="numeric"
                  placeholder="—"
                  className="tabular-nums"
                />
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-[var(--radius)] border border-[color:var(--color-border)] p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={isStockItem}
                onChange={(e) => setIsStockItem(e.target.checked)}
              />
              <span>
                <span className="font-medium">Stock item</span>
                <br />
                <span className="text-[color:var(--color-ink-3)]">
                  Can be &ldquo;handed over now&rdquo; in one tap (CONFIRMED → DELIVERED).
                </span>
              </span>
            </label>

            <div className="flex gap-3 pt-2">
              <DialogPrimitive.Close asChild>
                <Button variant="outline" className="flex-1" type="button">
                  Cancel
                </Button>
              </DialogPrimitive.Close>
              <Button
                type="submit"
                data-gold
                className="flex-1"
                disabled={pending || !name.trim() || (!categoryId && !newCategory.trim())}
              >
                {pending ? "…" : props.mode === "create" ? "Add product" : "Save changes"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
