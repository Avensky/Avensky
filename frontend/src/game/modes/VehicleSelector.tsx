import { useSelectionStore, useUIStore } from "../../store";
import { SelectorArrow } from "./SelectorArrow";
import { getSelectionClasses } from "../../components/menus/selectionStyles";

type VehicleSelectorProps = {
  menuIndex?: number;
  menuId?: "sandbox_setup";
  showName?: boolean;
  showRole?: boolean;
  translucent?: boolean;
  formNavigation?: boolean;
  disabled?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  title?: string;
  role?: string;
};

export function VehicleSelector({
  menuIndex = 0,
  menuId = "sandbox_setup",
  showName = true,
  showRole = true,
  translucent = false,
  formNavigation = false,
  disabled = false,
  onPrevious,
  onNext,
  title,
  role,
}: VehicleSelectorProps) {
  const vehicle = useSelectionStore((s) => s.getSelectedVehicle());
  const previousVehicle = useSelectionStore((s) => s.prevVehicle);
  const nextVehicle = useSelectionStore((s) => s.nextVehicle);

  const selectedIndex = useUIStore((s) => s.selectedMenuIndexById[menuId]);
  const setActiveMenuIndex = useUIStore((s) => s.setActiveMenuIndex);

  const selected = selectedIndex === menuIndex;
  const background = getSelectionClasses(selected, translucent);

  return (
    <div
      className={`selection-strip border-t transition-[background,border-color,box-shadow] duration-200 ${background}`}
      data-controller-selector={formNavigation || undefined}
      onPointerEnter={() => {
        if (!formNavigation) setActiveMenuIndex(menuIndex);
      }}
      onFocusCapture={() => {
        if (!formNavigation) setActiveMenuIndex(menuIndex);
      }}
    >
      <div className="selection-strip-layout">
        <SelectorArrow
          formNavigation={formNavigation}
          disabled={disabled}
          variant={
            translucent
              ? "neutral"
              : menuId === "sandbox_setup"
                ? "selector"
                : "secondary"
          }
          direction="previous"
          label="Previous vehicle"
          onPress={onPrevious ?? previousVehicle}
        />

        <div className="min-w-0 flex-1 text-center">
          <p className="selection-strip-label text-slate-400">VEHICLE</p>
          <div className="selection-strip-heading">
            {showName && (
              <h2
                className={`selection-strip-title truncate font-black transition-colors duration-200 ${
                  selected || translucent ? "text-cyan-100" : "text-slate-500"
                }`}
              >
                {title ?? vehicle.name}
              </h2>
            )}

            {showRole && vehicle.role && (
              <p
                className={`selection-strip-role uppercase transition-colors duration-200 ${
                  selected || translucent
                    ? "text-yellow-300"
                    : "text-yellow-300/40"
                }`}
              >
                {role ?? vehicle.role}
              </p>
            )}
          </div>

        </div>

        <SelectorArrow
          formNavigation={formNavigation}
          disabled={disabled}
          variant={
            translucent
              ? "neutral"
              : menuId === "sandbox_setup"
                ? "selector"
                : "secondary"
          }
          direction="next"
          label="Next vehicle"
          onPress={onNext ?? nextVehicle}
        />
      </div>
    </div>
  );
}
