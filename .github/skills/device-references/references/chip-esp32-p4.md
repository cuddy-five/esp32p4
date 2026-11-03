# ESP32-P4 chip

Retrieved 2026-11-03.

## Sources

1. **ESP-IDF `soc_caps.h` for ESP32-P4** (Espressif's capability header, used
   to build ESP-IDF):
   https://github.com/espressif/esp-idf/blob/0e6b480f858c69862ffb6001d96e9eef74599a6e/components/soc/esp32p4/include/soc/soc_caps.h
   (`master`, commit dated 2026-11-02). A `1` means ESP-IDF treats the feature
   as present on the target. The header covers the chip family, not a specific
   chip revision or package.
2. **Espressif ESP32-P4 product page**: https://www.espressif.com/en/products/socs/esp32-p4.
   Read through a fetch tool that returned quoted sentences. Re-read the page
   before quoting it elsewhere.
3. **ESP32-P4 datasheet**: https://documentation.espressif.com/esp32-p4_datasheet_en.pdf
   (downloaded again on 2026-11-03 with the same SHA-256,
   `fb4f3e91cc2ac519ec08cdec3dac9cb62b546cf5402ead1c5b83595a21bb6bc6`).
   **Not read**: its text is CID-encoded, so the standard-library extractor that
   read the board schematic returns almost nothing, and no PDF text tool is
   installed. Facts that need it are marked unverified below.
4. **ESP-IDF eFuse table for ESP32-P4**, `components/efuse/esp32p4/esp_efuse_table.csv`
   at the same commit as (1):
   https://github.com/espressif/esp-idf/blob/0e6b480f858c69862ffb6001d96e9eef74599a6e/components/efuse/esp32p4/esp_efuse_table.csv
5. **ESP-IDF programming guide for ESP32-P4** (`latest`, read 2026-11-03 through
   a fetch tool that returned quoted sentences):
   [Random Number Generation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/api-reference/system/random.html)
   and [Security Overview](https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/security/security.html).
   Re-read the pages before quoting them elsewhere.

## Facts

| Fact | Status | Evidence |
| --- | --- | --- |
| Two high-performance (HP) cores | Verified | `SOC_CPU_CORES_NUM (2U)` (1) |
| HP cores are RISC-V, up to 400 MHz | Verified | "Powered by a dual-core RISC-V CPU running at speeds up to 400 MHz" (2) |
| A low-power (LP) core, up to 40 MHz | Verified | `SOC_LP_CORE_SUPPORTED 1` (1); "an LP-Core capable of running at up to 40 MHz" (2) |
| 768 KB on-chip SRAM in the HP system | Verified | "Its HP core system includes 768 KB of on-chip SRAM" (2) |
| External PSRAM supported, DMA-capable, encryption configurable per MMU page | Verified | `SOC_SPIRAM_SUPPORTED`, `SOC_PSRAM_DMA_CAPABLE`, `SOC_PSRAM_ENCRYPTION_PAGE_CONFIGURABLE` (1) |
| **No integrated Wi-Fi or Bluetooth radio** | Verified | No `SOC_WIFI_SUPPORTED` or `SOC_BT_SUPPORTED` in (1). The page says a separate ESP32-C or S series chip "can serve as a wireless companion chip" (2) |
| MIPI-CSI camera input with an ISP; MIPI-DSI display | Verified | `SOC_MIPI_CSI_SUPPORTED`, `SOC_ISP_SUPPORTED`, `SOC_MIPI_DSI_SUPPORTED` (1) |
| USB OTG 2.0 HS | Verified | `SOC_USB_OTG_SUPPORTED` (1); "USB OTG 2.0 HS" (2) |
| SHA-2 accelerator, including SHA-256 and SHA-512 | Verified | `SOC_SHA_SUPPORTED`, `SOC_SHA_SUPPORT_SHA256`, `SOC_SHA_SUPPORT_SHA512` (1) |
| AES, big-number (MPI), HMAC and Digital Signature peripherals | Verified | `SOC_AES_SUPPORTED`, `SOC_MPI_SUPPORTED`, `SOC_HMAC_SUPPORTED`, `SOC_DIG_SIGN_SUPPORTED` (1) |
| Random number generator present | Verified | `SOC_RNG_SUPPORTED 1` (1) |
| **The RNG gives true random numbers only while the SAR ADC entropy source is on** (between `bootloader_random_enable()` and `bootloader_random_disable()`) or while the second-stage bootloader runs. Otherwise its output "should be considered as pseudo-random only". The P4 has no radio, so the radio condition other chips have does not apply. | Verified | (5) Random Number Generation: "The hardware RNG produces true random numbers so long as one or more of the following conditions are met"; "If none of the above conditions are true, the output of the RNG should be considered as pseudo-random only." Seed generation must enable the source first. |
| RNG entropy sources: a ring-oscillator thermal-noise source, `RC_FAST_CLK` metastability and a secondary source sampling an asynchronous 8 MHz oscillator | Verified (as declared) | (5) Random Number Generation. Entropy quality is **not measured**. |
| **Hardware ECDSA covers NIST P-192, P-256 and P-384 only, not secp256k1** | Verified | `SOC_ECDSA_SUPPORTED`; `SOC_ECDSA_SUPPORT_CURVE_SPECIFIC_KEY_PURPOSES`, commented "(P192, P256, P384)" (1). Bitcoin signing on secp256k1 must run in software. |
| ECC point multiplication is constant time | Verified (as declared) | `SOC_ECC_CONSTANT_TIME_POINT_MUL 1` (1). The claim covers the NIST-curve ECC peripheral only. |
| No BLAKE2 accelerator | Verified (as declared) | (1) defines no BLAKE2 capability. BLAKE2b would run in software. |
| Secure Boot V2 with RSA or ECC keys, 3 key digests, revocation | Verified | `SOC_SECURE_BOOT_V2_RSA`, `SOC_SECURE_BOOT_V2_ECC`, `SOC_EFUSE_SECURE_BOOT_KEY_DIGESTS 3`, `SOC_SUPPORT_SECURE_BOOT_REVOKE_KEY` (1) |
| Flash encryption with XTS-AES-128 or -256 | Verified | `SOC_FLASH_ENCRYPTION_XTS_AES`, `SOC_FLASH_ENCRYPTION_XTS_AES_128`, `SOC_EFUSE_XTS_AES_KEY_256` (1) |
| Key Management Unit usable | **Unverified** | The page names "a dedicated Key Management Unit" (2), but (1) sets `SOC_KEY_MANAGER_SUPPORTED 0` while defining key-deployment capabilities. Check the chip revision and ESP-IDF support. |
| Variant ESP32-P4NRW32X has 32 MB PSRAM in the package | Verified for the board | Waveshare names "ESP32-P4NRW32X ESP32-P4 with 32MB stacked PSRAM" (board file). Not yet checked against the datasheet's ordering table. |
| JTAG can be disabled permanently (`DIS_PAD_JTAG`, `DIS_USB_JTAG`) or "softly" (`SOFT_DIS_JTAG`, re-enabled by an HMAC key) | Verified | (4): `DIS_PAD_JTAG` "disabled in the hard way(permanently)", `SOFT_DIS_JTAG`, `DIS_USB_JTAG`; (5) Security Overview: "soft disabling the JTAG interface and it can be re-enabled by programming a secret key through HMAC" |
| JTAG stays disabled once any security feature (secure boot, flash encryption) is enabled; Secure UART Download mode turns on the same way, and `DIS_DOWNLOAD_MODE` disables ROM download mode entirely | Verified | (5) Security Overview: "JTAG interface stays disabled if any of the security features are enabled"; (4): `DIS_DOWNLOAD_MODE`, `DIS_USB_SERIAL_JTAG_DOWNLOAD_MODE`, `SECURE_BOOT_EN`, `SPI_BOOT_CRYPT_CNT` |
| eFuse layout: field names, block, bit position and width | Verified | (4). Read it there; do not copy offsets into code from this file. |
| The hardware ECDSA peripheral can be forced to use a hardware-random `k` (`ECDSA_ENABLE_SOFT_K`) | Verified (as declared) | (4). Applies to the NIST-curve peripheral only; secp256k1 signing is in software (row above). |
| Memory map and power domains | **Unverified** | Needs the datasheet and the Technical Reference Manual. |
