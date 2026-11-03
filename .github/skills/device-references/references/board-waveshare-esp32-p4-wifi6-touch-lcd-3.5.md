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
2. **Waveshare resources page** (schematics, datasheets, examples):
   https://docs.waveshare.net/ESP32-P4-WIFI6-Touch-LCD-3.5/Resources-And-Documents.
   **Not read yet.**
3. **Waveshare board support package**, `waveshare/esp32_p4_wifi6_touch_lcd_3_5`
   in the ESP Component Registry: https://components.espressif.com/components/waveshare/esp32_p4_wifi6_touch_lcd_3_5.
   Not read; seen only in search results (latest version 2.0.2).

## Facts

| Fact | Status | Evidence from (1) |
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
| **How to hold the ESP32-C6 radio off** (reset or enable line, AXP2101 power rail) | **Unverified** | The historical specification proposes driving a C6 reset/enable GPIO low and cutting its power domain through the AXP2101. No schematic has been read. Software shutdown does not prove physical isolation. |
| Which camera module the device uses | **Unverified** | Not chosen. |
| GPIO assignments, power rails, debug and UART exposure | **Unverified** | Needs the schematic (2). |
