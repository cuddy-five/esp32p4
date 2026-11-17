# Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5

The owner's board: bought before 2026-10-26 and named again as the target on
2026-11-13. Check the physical unit's PCB revision before applying these
sources. The recorded target **v3.2 is the ESP32-P4 chip revision**, not a
confirmed PCB revision.

**Read from the owner's unit** (`espflash board-info`, 2026-10-28, Atuin history
`01a18436153f7585a22af39eccd160e7`): chip `esp32p4 (revision v3.2)`, 40 MHz
crystal, 16 MB flash, security flags `0x00000000`. It was reached through the
board's USB-to-UART bridge, which the host shows as `/dev/ttyACM0` ("USB Single
Serial", USB vendor `1a86`, WCH). The host rule
`/etc/udev/rules.d/60-esp32.rules` gives the logged-in user the tty of vendors
`303a` (Espressif) and `1a86` (`TAG+="uaccess"`), so no `dialout` group is
needed. The PCB revision is still unread. The owner states that the unit
carries the installed 5 MP OV5647 camera. Nobody has checked that on the
device. esp-hal has released no driver for the camera interface, so the
owner's plan is a `no_std` driver written for this project (see the facts
below). Until it exists and runs on the board, firmware cannot use the camera.

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
   pins, and no ESP32-C6 or AXP2101 pins. Read again on 2026-11-14 with
   `include/bsp/display.h` and the driver source `esp32_p4_wifi6_touch_lcd_3_5.c`
   (SHA-256: header `e2e80d2ea7a12768186a50ccbed8ccd4f2bcc7ec687d68030e73366fc1cd8a16`,
   `display.h` `342956b064ac5f176f0c584721dc80bf64d557334b0e664876e16e1960fd7905`,
   source `f2a69a92e3fa305d84336bd25837f2b2c060f8df62280797cc52bc94f3ae98c3`).
4. **Espressif's OV5647 sensor driver**, `esp_cam_sensor/sensors/ov5647/` in
   https://github.com/espressif/esp-video-components at
   `48c1892af113407f118b588a1d2999ab0474bad8` (`master`, 2026-11-13),
   Apache-2.0, read 2026-11-15 (`ov5647.c`, 837 lines, SHA-256
   `db9e9eb366c653e52eb642c0a2079193d5033b61e310012eab4e17e0c1a5b97c`). C code
   for ESP-IDF: a source of register tables to port, not a Rust driver.

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
| Which camera module the device uses | **Owner statement (2026-10-26); not checked on the device** | The 5 MP OV5647, installed on the purchased unit. Read the module marking and a boot log before relying on it. |
| **esp-hal has released no camera driver.** It marks `camera`, `mipi_csi` and `isp` as not supported on the ESP32-P4. The owner's plan is a `no_std` driver written for this project. | Verified for esp-hal; owner decision (2026-10-26, restated 2026-11-15) for the plan | [Chip file](chip-esp32-p4.md#camera-input-what-a-driver-can-build-on): what the driver can build on, and esp-hal `c72d6805` (2026-11-13). Read it again before planning camera work. |
| The OV5647 as Espressif's driver sets it up: control over I2C at address `0x36`, chip ID `0x5647`; raw 8-bit modes of 800×640, 800×800 and 800×1280 at 50 frames a second on 2 lanes, from a 24 MHz input clock; colour filter order GBRG | Verified (as declared) | (4) `include/ov5647.h:14-15`; `ov5647.c:41`, `107-162`. Not run on the owner's module. |
| Camera wiring on this board: the I2C pins the sensor answers on, its reset and power-down lines, where its clock comes from, and which rail powers the chip's MIPI D-PHY | **Unverified** | The vendor package (3) has no camera code. Trace (2), then read the sensor's chip ID on the device. |
| Whether the module's fixed lens resolves a QR code at reading distance | **Unverified** | Needs frames from the device |
| Display wiring as the vendor's code sets it: ST7796 on `SPI2`, SPI mode 3, 80 MHz; MOSI GPIO20, clock GPIO21, chip select GPIO23, data/command GPIO26, reset GPIO27, backlight GPIO28, no MISO. 320×480, 16-bit RGB565 sent big-endian, BGR order, colours inverted, X mirrored. | Verified (as declared) | (3) header lines 49-55 and 250; `display.h` lines 11-20; source lines 431-463. Not traced on the schematic and not measured. |
| Touch wiring as the vendor's code sets it: I2C SCL GPIO8, SDA GPIO7; touch reset GPIO29, interrupt GPIO50; the vendor uses its `ft5x06` driver for the FT6336 | Verified (as declared) | (3) header lines 38-39, 56-57; source lines 513-516. Not traced or measured. |
| microSD wiring as the vendor's code sets it: SD/MMC slot 0, 4-bit; clock GPIO43, command GPIO44, data GPIO39-42. **The card is powered through the chip's on-chip LDO channel 4**, which a driver must switch on first. | Verified (as declared) | (3) header lines 60-65; source lines 140-159 (`ldo_chan_id = 4`). Not traced or measured. |
| The rest of the GPIO map, the power-rail map and P4 debug/UART exposure | **Unverified** | Not traced. Render (2) with `pdftoppm -r 400` and follow the nets. |
