# Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5

The candidate board named in `PROJECT.md` and the historical specification.
**The owner has not confirmed it as the final board.** Check the revision you
actually hold.

Retrieved 2026-11-03.

## Sources

1. **Waveshare product documentation**: https://docs.waveshare.com/ESP32-P4-WIFI6-Touch-LCD-3.5
   (the older `www.waveshare.com/wiki/...` address returned HTTP 404). Read through
   a fetch tool that returned quoted text. Re-read the page before relying on a
   detail.
2. **Board schematic**, `schematic/ESP32-P4-WIFI6-Touch-LCD-3.5-schematic.pdf` in
   Waveshare's board repository
   https://github.com/waveshareteam/ESP32-P4-WIFI6-Touch-LCD-3.5 at commit
   `870588e62daaf723f3c52f0060d8dc053665ed30` (the file last changed in
   `f9772f55`, 2026-03-17). SHA-256
   `3d8b63f8f2a5a89d00c54eaf9798658f3147774e8d3383a1b0a96d5fb9c82d30`. One A4
   page, exported from Altium Designer; no revision label was found. **How it
   was read (2026-11-03):** text labels with their page positions first, then
   the regions below rendered at 400-600 dpi with `pdftoppm` (poppler 26.01.0)
   and the wires followed by eye. Facts marked "Verified (visual)" were traced
   that way.
3. **Waveshare board support package**, `waveshare/esp32_p4_wifi6_touch_lcd_3_5`
   in the ESP Component Registry: https://components.espressif.com/components/waveshare/esp32_p4_wifi6_touch_lcd_3_5.
   Version 2.0.2, source at
   https://github.com/waveshareteam/Waveshare-ESP32-components/tree/3812a4c6146ccba2448695f3df7f24b9d9be1d34/bsp/esp32_p4_wifi6_touch_lcd_3_5
   (Apache-2.0). Its header `include/bsp/esp32_p4_wifi6_touch_lcd_3_5.h` was
   read on 2026-11-03. It defines the display, touch, audio, I2C and microSD
   pins, and no ESP32-C6 or AXP2101 pins.

## Facts

| Fact | Status | Evidence ((1) unless stated) |
| --- | --- | --- |
| Product name ESP32-P4-WIFI6-Touch-LCD-3.5 (SKU 33360; variant `-EN`, SKU 33511) | Verified | Product page |
| Main chip ESP32-P4NRW32X with 32 MB PSRAM stacked in the package | Verified | "ESP32-P4NRW32X ESP32-P4 with 32MB stacked PSRAM" |
| 16 MB NOR flash outside the chip package | Verified | "integrated 16MB Nor Flash outside the package" |
| **An onboard ESP32-C6H8 provides Wi-Fi 6 and BLE 5 over SDIO** | Verified | "Onboard ESP32-C6H8 Wi-Fi 6 co-processor"; "ESP32-C6 SDIO interface protocol" |
| 3.5-inch 320×480 IPS display, ST7796 driver (SPI), FT6336 touch (I2C) | Verified | "320×480"; "ST7796 driver chip and FT6336 capacitive touch chip" |
| Camera input: 2-lane MIPI-CSI, 15-pin 0.5 mm connector; OV5647 named as supported | Verified | "MIPI-CSI (2-lane), 0.5mm pitch, 15PIN"; "supporting OV5647 and other cameras" |
| AXP2101 power management IC; 3.7 V lithium battery header (MX1.25) | Verified | "Adopts AXP2101 IC for efficient power management" |
| ES8311 audio codec, amplifier, speaker header, one microphone | Verified | Product page |
| microSD slot (SDIO 3.0); USB-C for USB-to-UART and USB-C for USB OTG | Verified | Product page |
| PWR, RESET and BOOT buttons; BOOT during reset enters download mode | Verified | Product page |
| ESP32-P4 GPIO54 drives the ESP32-C6's `CHIP_PU` (enable) through R54, a 0 Ω resistor; GPIO6 reaches the C6's IO2 through R52 (0 Ω) | Verified (visual) | (2): `GPIO54` → R54 `0R` → `C6_CHIP_PU`, and `GPIO6` → R52 `0R` → `C6_IO2`, beside the C6 block (U1, ESP32-C6FH8). GPIO54 is also ESP-Hosted's default slave-reset pin for the ESP32-P4. |
| **`C6_CHIP_PU` has a 10 kΩ pull-up (R25) to `ESP_3V3` and 1 µF (C113) to ground, so the C6 runs whenever GPIO54 is not actively driven low**: during P4 reset, in the ROM and bootloader, and if firmware never configures the pin | Verified (visual) for the circuit; Inferred for the consequence | (2): `ESP_3V3` → R25 `10K` → `C6_CHIP_PU` → U1 pin 4 `CHIP_PU`, with C113 `1uF` to ground. The C6's standard reset network. That the C6 then runs follows from that circuit and the C6's documented enable behaviour, not from a test on the board. |
| **The C6 has no separately switched supply.** Its `VDD3V3` comes from `ESP_3V3` through IND1, a 2 nH high-frequency inductor. `ESP_3V3` is the AXP2101's DCDC1 output, and it also feeds the P4's I/O supply. Cutting the C6's power through the AXP2101 would also cut the P4. | Verified (visual) | (2): AXP2101 `LX1` (pin 22) → L1 `1uH/3.5A` → net `3V3`, with `FB1` (pin 21) feedback; a wire ties net labels `3V3` and `ESP_3V3`; `ESP_3V3` → IND1 `0201 2nH` → `VDD3V3` at the C6; `ESP_3V3` → P4 pin 10 `VDDPST_1`. |
| **How to keep the ESP32-C6 radio off: remove the C6, or its antenna feed** | **Owner decision (2026-11-03); not done yet** | GPIO54 control is software-only, the pull-up enables the C6 whenever the P4 is not driving it, and its supply cannot be cut separately (rows above). Removing the chip is stronger than removing the antenna feed, which leaves the C6 running. Rework and checks: [#21](https://github.com/cuddy-five/esp32p4/issues/21). |
| The ESP32-C6's UART0 (`C6_U0TXD`, `C6_U0RXD`) and `C6_IO9` (its boot-mode strapping pin) reach a pin header beside P4 GPIO31-33 | Inferred (schematic labels); not checked visually | (2): those labels sit in the header's pin column, numbered 25-30. Anyone with header access could reflash the C6. |
| Which camera module the device uses | **Unverified** | Not chosen. |
| Full GPIO map, power-rail map and P4 debug/UART exposure | **Unverified** | Not traced. Render (2) with `pdftoppm -r 400` and follow the nets. |
