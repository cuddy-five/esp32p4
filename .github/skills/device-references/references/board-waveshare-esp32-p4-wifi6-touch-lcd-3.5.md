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
   `3d8b63f8f2a5a89d00c54eaf9798658f3147774e8d3383a1b0a96d5fb9c82d30`. One
   page; no revision label was found in its text. **How it was read:** no PDF
   viewer or text tool is installed, so a standard-library script extracted
   every text label with its page position. Net names, part values and pin
   labels are therefore exact; which label sits on which wire was **inferred
   from position**, not traced. Facts read that way say "Inferred (schematic
   labels)". Confirm them visually before a hardware change.
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
| ESP32-P4 GPIO54 drives the ESP32-C6's `CHIP_PU` (enable) through R54, a 0 Ω resistor; GPIO6 reaches the C6's IO2 through R52 (0 Ω) | Inferred (schematic labels) | (2): `GPIO54`, `R54 0R`, `C6_CHIP_PU` on one row; `GPIO6`, `R52 0R`, `C6_IO2` on the next. GPIO54 is also ESP-Hosted's default slave-reset pin for the ESP32-P4. |
| **`C6_CHIP_PU` has a 10 kΩ pull-up (R25) to `ESP_3V3` and 1 µF (C113) to ground, so the C6 runs whenever GPIO54 is not actively driven low**: during P4 reset, in the ROM and bootloader, and if firmware never configures the pin | Inferred (schematic labels) | (2): `R25 10K` and `C113 1uF` beside the C6's `CHIP_PU` pin (pin 4) and `ESP_3V3`. This is the C6's standard reset network. |
| **The C6 has no separately switched supply.** Its `VDD3V3` comes from `ESP_3V3` through a 2 nH RF inductor (IND1); `ESP_3V3` is the board's main 3.3 V rail, which also powers the P4 and sits beside the AXP2101's DCDC1 output (`3V3`). Cutting the C6's power through the AXP2101 would also cut the P4. | Inferred (schematic labels) | (2): `VDD3V3`, `IND1`, `0201 2nH`, `ESP_3V3` together; `ESP_3V3` appears at about 30 places; `3V3` and `ESP_3V3` share a row at the DCDC1 output (`LX1`, `FB1`, `L1 1uH/3.5A`). |
| **How to hold the ESP32-C6 radio off** | **Unverified; the historical plan does not work as written** | The historical specification proposes holding a C6 reset/enable GPIO low and cutting its power domain through the AXP2101. The first is possible (GPIO54) but is software-controlled, and the pull-up enables the C6 whenever the P4 is not driving the pin. The second appears impossible on this board (row above). Physical isolation would need a hardware change, for example removing R54 and R25 and fitting a pull-down on `CHIP_PU`, or removing the C6 or its antenna feed. That is a design decision for the owner and needs a visual check of the schematic. |
| The ESP32-C6's UART0 (`C6_U0TXD`, `C6_U0RXD`) and `C6_IO9` (its boot-mode strapping pin) reach a pin header beside P4 GPIO31-33 | Inferred (schematic labels) | (2): those labels sit in the header's pin column, numbered 25-30. Anyone with header access could reflash the C6. |
| Which camera module the device uses | **Unverified** | Not chosen. |
| Full GPIO map, power-rail map and P4 debug/UART exposure | **Unverified** | Needs a visual reading of (2). |
