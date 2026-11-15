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
3. **ESP32-P4 Series Datasheet v0.7 (Pre-release)**, dated 2026-07-14, 102 pages:
   https://documentation.espressif.com/esp32-p4_datasheet_en.pdf (downloaded
   2026-11-03, SHA-256
   `fb4f3e91cc2ac519ec08cdec3dac9cb62b546cf5402ead1c5b83595a21bb6bc6`). Read with
   `pdftotext -layout` (poppler 26.01.0). It is a pre-release: re-check facts
   against a later version before relying on them in firmware.
4. **ESP-IDF eFuse table for ESP32-P4**, `components/efuse/esp32p4/esp_efuse_table.csv`
   at the same commit as (1):
   https://github.com/espressif/esp-idf/blob/0e6b480f858c69862ffb6001d96e9eef74599a6e/components/efuse/esp32p4/esp_efuse_table.csv
5. **ESP-IDF programming guide for ESP32-P4** (`latest`, read 2026-11-03 through
   a fetch tool that returned quoted sentences):
   [Random Number Generation](https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/api-reference/system/random.html)
   and [Security Overview](https://docs.espressif.com/projects/esp-idf/en/latest/esp32p4/security/security.html).
   Re-read the pages before quoting them elsewhere.
6. **ESP32-P4 Technical Reference Manual, Pre-release v0.7** (2026-08-20):
   https://documentation.espressif.com/esp32-p4_technical_reference_manual_en.pdf
   (downloaded 2026-11-03, SHA-256
   `622fe9625d19cf00bd7aa49e65f0b5dd6ef2197f83cb7a88b4405078d6a957d4`). Chapters
   9 "System and Memory", 15 "Low-Power Management" and 20 "Permission Control"
   were read with `pdftotext -layout`.
7. **ESP-IDF memory and register maps**, at the same commit as (1):
   `components/soc/esp32p4/include/soc/soc.h` and
   [`register/hw_ver3/soc/reg_base.h`](https://github.com/espressif/esp-idf/blob/0e6b480f858c69862ffb6001d96e9eef74599a6e/components/soc/esp32p4/register/hw_ver3/soc/reg_base.h)
   (chip revision v3).
8. **The ESP32-P4 SVD behind the Rust PAC**, esp-rs/esp-pacs
   [`esp32p4.base.svd`](https://github.com/esp-rs/esp-pacs/blob/24c4ff81da2cb9c8e9831d28c92d4e64cabde15f/esp32p4/svd/esp32p4.base.svd)
   at `24c4ff81`. Used only to cross-check (7).
9. **ESP32-P4 Series SoC Errata** (`latest`, retrieved 2026-11-03):
   [chip revision identification](https://docs.espressif.com/projects/esp-chip-errata/en/latest/esp32p4/01-chip-identification/index.html),
   [errata summary](https://docs.espressif.com/projects/esp-chip-errata/en/latest/esp32p4/02-errata-summary/index.html)
   and the pages for ECDSA_DS-836 and ROM-816. Re-read before relying on them.
10. **ESP-IDF revision settings**, at the same commit as (1):
    `components/esp_hw_support/port/esp32p4/Kconfig.hw_support` and `COMPATIBILITY.md`.
11. **esp-hal's device description for the ESP32-P4**,
    [`esp-metadata/devices/esp32p4/soc.toml`](https://github.com/esp-rs/esp-hal/blob/c72d6805fce0764bbe97d1e97a47896c6d4744bf/esp-metadata/devices/esp32p4/soc.toml)
    at esp-rs/esp-hal `c72d6805` (`main`, 2026-11-13; read 2026-11-14, SHA-256
    `d561d01be9c3562ee23c31b04cd61cb79a12d30c6a70c791ab2306f8bafadc21`). The
    project generates its driver support table from this file.
12. **esp-hal 1.2.0 documentation built for the ESP32-P4**:
    https://docs.espressif.com/projects/rust/esp-hal/1.2.0/esp32p4/esp_hal/index.html
    (downloaded 2026-11-14, SHA-256
    `a29667b4ed75407f8d9c0e75d62ef0de9d69a2d5bcbe5e20acea3932c8807fc2`). The same
    page for 1.2.1 and 1.2.2 returned HTTP 404.
13. **Espressif advisory AR2026-004**, "Compatibility Advisory for ESP32-P4 Chip
    Revision v3.2", V1.0, 2026-05-15:
    https://documentation.espressif.com/AR2026-004_Compatibility_Advisory_for_ESP32-P4_Chip_Revision_v3.2_EN.html
    (downloaded 2026-11-14, SHA-256
    `163ab3069d06f37059f758e1bf35e3bb151f1e602d3f49b8c07645136d9cf6d8`).
14. **ESP32-P4 Chip Revision v3.x User Guide v1.1** (2026-08):
    https://documentation.espressif.com/esp32-p4-chip-revision-v3.x_user_guide_en.html
    (downloaded 2026-11-14, SHA-256
    `0815f7568d37aef488ccdcbbad57bdcf8ae737f2b780a57c8bfff8935d974ee0`).
15. **ESP-IDF's MIPI-CSI camera receiver driver**, at the same commit as (1),
    Apache-2.0, read 2026-11-15:
    [`components/esp_driver_cam/csi/src/esp_cam_ctlr_csi.c`](https://github.com/espressif/esp-idf/blob/0e6b480f858c69862ffb6001d96e9eef74599a6e/components/esp_driver_cam/csi/src/esp_cam_ctlr_csi.c)
    (729 lines, SHA-256
    `cf4795c275c3c95ce3ab2691e03eec96edd698533744cf0cdb86cfbc56d66a44`),
    `components/esp_hal_cam/mipi_csi_hal.c` (75 lines, SHA-256
    `0f3d0d7e2071e5b45525ccaa2da65687defc06662b0992ce675ba606d2d8193d`) and the
    four `mipi_csi_*_ll.h` headers in `components/esp_hal_cam/esp32p4/include/hal/`.
16. **The Rust register crate `esp32p4`**, esp-rs/esp-pacs at `08790a64`
    (`main`, 2026-11-12): the module list of
    [`esp32p4/src`](https://github.com/esp-rs/esp-pacs/tree/08790a640a15782fb98c434870bce60cbe65a548/esp32p4/src),
    read 2026-11-15.
17. **esp-hal pull request 6739**, "Add ESP32-P4 MIPI-CSI camera support":
    https://github.com/esp-rs/esp-hal/pull/6739, head `27c3233e`, opened
    2026-11-10. Open, with no maintainer review, when read on 2026-11-15. Its
    description is its author's claim; this project has run none of it.

## Target silicon: revision v3.2

The device targets ESP32-P4 chip revision **v3.2** (owner, 2026-11-03). Read
the revision of the chip you actually hold before relying on this section.

| Fact | Status | Evidence |
| --- | --- | --- |
| v3.2 is wafer version major 3, minor 2 in eFuse; its package carries manufacturing code `X H XX` or `X J XX`. ESP-IDF prints the revision at boot. | Verified | (9) identification Tables 1 and 2; (4) `WAFER_VERSION_MAJOR_LO`/`_HI`, `WAFER_VERSION_MINOR` |
| v3.x firmware is not compatible with v0.x and v1.x chips. ESP-IDF builds for v3.x by default (minimum revision v3.1, maximum v3.99); it has no v3.2-specific setting. | Verified | (10) `Kconfig.hw_support`: "Revisions higher than 3.0 (included) is not compatible with 0.x and 1.x", `default ESP32P4_REV_MIN_301`, `ESP32P4_REV_MAX_FULL` 399 |
| ESP-IDF's `COMPATIBILITY.md` lists only P4 v1.0 and v1.3, not v3.x | Verified | (10) |
| **ECDSA_DS-836 (v3.0-v3.2, "No fix scheduled"): the hardware ECDSA peripheral accepts the signature `r, s = 0 or n` for any message and key. Espressif's workaround: use RSA Secure Boot, not ECDSA.** | Verified | (9) ECDSA_DS-836 page |
| ROM-816 (v3.2 only): the `rom_download_xpd_on` eFuse, new in v3.2, can hang the chip. Program it only if Secure Download Mode is required, and power-cycle fully before a USB download after programming it. | Verified | (9) ROM-816 page |
| v3.2 is not affected by APM-560 or DMA-767, the permission-unit errata of v3.0 and earlier, so the APM advice below applies | Verified for the errata table; Inferred for the advice | (9) errata summary, v3.2 column |
| Register maps for v3: ESP-IDF's `hw_ver3` headers and the version-3 SVD | Verified (location) | (7), (8) |
| The v3.x sub-revisions share one hardware design. A v1.x chip and a v3.x chip cannot run the same firmware image. | Verified | (13) "The hardware of different sub-revisions within ESP32-P4 v3.x is fully compatible"; (14) §2.1.2 |
| A v3.x chip needs a v3.x board: pin 54 changed from not connected to `VDD_HP_1`, and the DCDC circuit gained parts | Verified | (14) §2.1.1. Whether the owner's board is that design is not checked. |
| The v3.2 ROM powers the flash on by itself for a download. esptool needs v5.3.dev3 or v4.12.dev2, or later. | Verified | (13) §1. Whether `espflash` can flash a v3.2 chip is **unverified**. |
| v3.2 fixes a ROM fault in the RTC watchdog setup: on v3.1 and earlier the timeout is twice the configured value. Firmware that always compensates waits half as long on v3.2 and can reset during boot. | Verified | (13) §2. Check how the chosen HAL sets the LP watchdog. |
| v3.x has 32 PMP entries, 8 address ranges in the peripheral APM (was 2), and a separate RNG module with its own permission bit | Verified (as declared) | (14) §1.1, §1.11, §1.18 |

## Rust `no_std` support (esp-hal)

What Espressif's Rust HAL offers for this chip. A driver marked supported is the
project's own claim; nobody has run it on the owner's board.

| Fact | Status | Evidence |
| --- | --- | --- |
| The Rust target for the HP cores is `riscv32imafc-unknown-none-elf`, the target `firmware/rust-toolchain.toml` installs | Verified | (11) `[device] target` |
| esp-hal supports the P4 at chip revision v3.0 and later only. It refuses to run on a lower revision by default. | Verified | (11) `support_note = "Revisions below v3.0 are not supported."`; (12) feature `esp32p4`, "chip revision >= v3.x", and `ESP_HAL_CONFIG_MIN_CHIP_REVISION` default 300 |
| Newest release: esp-hal 1.2.2 (2026-09-18), with the `esp32p4` feature, licence MIT OR Apache-2.0, minimum Rust 1.95.0 (the workspace pins 1.97.0) | Verified | crates.io registry record, read 2026-11-14; checksum `c9e3dfd511fed638fe41fdb4595f8c7f0cbb488d0f0cf2bbc063d76d805057cf` |
| Marked **supported**: GPIO, UART, SPI master, I2C master. In 1.2.0 these are stable API, with `rng`, `efuse`, `clock` and `time`. | Verified (as declared) | (11) `support_status`; (12) module list |
| Marked **partial**, and unstable API in 1.2.0: SD/MMC host, PSRAM, flash, DMA, timers, USB, MIPI-DSI, sleep, and the SHA, AES, ECC and RSA accelerators | Verified (as declared) | (11); (12). SD/MMC lacks 1.8 V signalling and delay tuning (esp-hal issue 6774, read 2026-11-14). |
| The RNG driver is partial: its read throttling is not tuned for the P4 and nothing tests the quality of its output. It reads the `LP_TRNG` block. | Verified (as declared) | (11) `[device.rng]`, `{ name = "RNG", pac = "LP_TRNG" }`; esp-hal issue 5979, read 2026-11-14 |
| **esp-hal has released no camera driver.** `camera`, `mipi_csi` and `isp` are `not_supported`, so reading the board's camera needs a driver written for this project ([what it can build on](#camera-input-what-a-driver-can-build-on)). `hmac`, `ds`, `ecdsa` and `key_manager` are not supported either. | Verified | (11); (12) lists no camera, CSI or ISP module |
| esp-hal turns PMP protection on by default (`ESP_HAL_CONFIG_ENABLE_PMP`, an unstable option) | Verified (as declared) | (12). Which regions it protects is **not reviewed**. |

## Camera input: what a driver can build on

The owner's plan is a `no_std` camera driver written for this project (owner,
2026-10-26, restated 2026-11-15). These rows say what exists to build it from.
None of it has run on the owner's board, and a host test cannot prove any of it.

| Fact | Status | Evidence |
| --- | --- | --- |
| The path a frame takes: camera sensor, the chip's MIPI D-PHY, the CSI host, the CSI bridge, then a DMA channel that writes the frame into memory | Verified | (15) `esp_cam_ctlr_csi.c:205-256`: host and bridge setup, then a DMA channel with source role `DW_GDMA_ROLE_PERIPH_CSI` |
| Espressif's C receiver driver is small and may be ported: 729 lines, plus 75 lines of setup and four register-access headers. Apache-2.0. It also needs the DMA driver (`components/esp_driver_dma/src/dw_gdma.c`). | Verified | (15), SPDX headers |
| **The image processor (ISP) can be skipped.** When the input and output formats are equal, the driver puts the bridge in bypass and the sensor's raw 8-bit frame reaches memory unchanged. | Verified | (15) `esp_cam_ctlr_csi.c:706-708` |
| A raw 8-bit frame is enough to read a QR code, which needs brightness only | Inferred | Not tested. The sensor's colour filter pattern must be averaged out first. |
| The Rust register crate defines the blocks a driver writes to: `mipi_csi_host`, `mipi_csi_bridge`, `isp`, `pmu`, and the DMA blocks `dma`, `ahb_dma` and `axi_dma` | Verified (names only) | (16). Which DMA block serves the camera, and whether the registers match (7), is **not checked**. |
| **A `no_std` Rust driver for this interface exists as an open pull request to esp-hal.** It receives raw 8-bit frames from a 1- or 2-lane camera into a DMA buffer (about 2,250 lines in `esp-hal/src/mipi_csi/`, plus D-PHY power and DMA modules). | Verified (that it exists) | (17) |
| Its author reports 100-frame streams at 29.9 frames a second on chip revision **v3.2** (ESP32-P4 Function EV Board v1.5.2), with an SC2336 sensor at 1024×600. Other sensors, the OV5647 among them, are not tested. | Verified (as declared) | (17) "Testing" |
| The author found DMA writes into PSRAM at 250 MHz unreliable until PSRAM timing was tuned at startup, and says the camera and the MIPI display share a DMA controller and a D-PHY power supply | Verified (as declared) | (17) description. Plan for frame buffers in PSRAM to need this. |
| A DMA channel can write wherever the permission unit allows, so frame buffers and secrets need separate, checked memory regions | Inferred | The DMA row under [Memory, access and power](#memory-access-and-power) |
| Whether the pull request is merged, and into which release | **Unverified** | Read (17) again before depending on it. Unreviewed code is not a wallet dependency until this project has reviewed the pinned commit. |

## Facts

| Fact | Status | Evidence |
| --- | --- | --- |
| Two high-performance (HP) cores | Verified | `SOC_CPU_CORES_NUM (2U)` (1) |
| HP cores are RISC-V, up to 400 MHz | Verified | "Powered by a dual-core RISC-V CPU running at speeds up to 400 MHz" (2) |
| A low-power (LP) core, up to 40 MHz | Verified | `SOC_LP_CORE_SUPPORTED 1` (1); "an LP-Core capable of running at up to 40 MHz" (2) |
| 768 KB on-chip SRAM in the HP system | Verified | "Its HP core system includes 768 KB of on-chip SRAM" (2); "768 KB of HP L2MEM: 200 MHz" (3) §4.1.3.1 |
| Other internal memory: 128 KB HP ROM, 16 KB LP ROM, 32 KB LP SRAM, 8 KB scratchpad memory (400 MHz), 4 Kbit eFuse with 1792 bits for user data | Verified | (3) §4.1.3.1 "System and Memory" |
| External flash up to 64 MB over SPI/Dual/Quad/QPI (120 MHz max), mapped through the cache in 64 KB blocks, with XTS-AES encryption | Verified | (3) §4.1.3.1 |
| External PSRAM supported, DMA-capable, encryption configurable per MMU page | Verified | `SOC_SPIRAM_SUPPORTED`, `SOC_PSRAM_DMA_CAPABLE`, `SOC_PSRAM_ENCRYPTION_PAGE_CONFIGURABLE` (1) |
| **No integrated Wi-Fi or Bluetooth radio** | Verified | No `SOC_WIFI_SUPPORTED` or `SOC_BT_SUPPORTED` in (1). The page says a separate ESP32-C or S series chip "can serve as a wireless companion chip" (2) |
| MIPI-CSI camera input with an ISP; MIPI-DSI display | Verified | `SOC_MIPI_CSI_SUPPORTED`, `SOC_ISP_SUPPORTED`, `SOC_MIPI_DSI_SUPPORTED` (1) |
| USB OTG 2.0 HS | Verified | `SOC_USB_OTG_SUPPORTED` (1); "USB OTG 2.0 HS" (2) |
| SHA-2 accelerator, including SHA-256 and SHA-512 | Verified | `SOC_SHA_SUPPORTED`, `SOC_SHA_SUPPORT_SHA256`, `SOC_SHA_SUPPORT_SHA512` (1) |
| AES, big-number (MPI), HMAC and Digital Signature peripherals | Verified | `SOC_AES_SUPPORTED`, `SOC_MPI_SUPPORTED`, `SOC_HMAC_SUPPORTED`, `SOC_DIG_SIGN_SUPPORTED` (1) |
| Random number generator present | Verified | `SOC_RNG_SUPPORTED 1` (1); (3) §4.1.5.9 calls it a "true random number generator (TRNG)" producing 32-bit values |
| **The RNG gives true random numbers only while the SAR ADC entropy source is on** (between `bootloader_random_enable()` and `bootloader_random_disable()`) or while the second-stage bootloader runs. Otherwise its output "should be considered as pseudo-random only". The P4 has no radio, so the radio condition other chips have does not apply. | Verified | (5) Random Number Generation: "The hardware RNG produces true random numbers so long as one or more of the following conditions are met"; "If none of the above conditions are true, the output of the RNG should be considered as pseudo-random only." Seed generation must enable the source first. |
| RNG entropy sources: thermal noise from the SAR ADC, an asynchronous clock mismatch, and the `BUF_CHAIN` ring oscillator | Verified (as declared) | (3) §4.1.5.9; (5) Random Number Generation adds the 8 MHz oscillator source. Entropy quality is **not measured**. |
| **Hardware ECDSA covers NIST P-192, P-256 and P-384 only, not secp256k1** | Verified | `SOC_ECDSA_SUPPORTED`; `SOC_ECDSA_SUPPORT_CURVE_SPECIFIC_KEY_PURPOSES`, commented "(P192, P256, P384)" (1). Bitcoin signing on secp256k1 must run in software. |
| ECC point multiplication is constant time | Verified (as declared) | `SOC_ECC_CONSTANT_TIME_POINT_MUL 1` (1). The claim covers the NIST-curve ECC peripheral only. |
| No BLAKE2 accelerator | Verified (as declared) | (1) defines no BLAKE2 capability. BLAKE2b would run in software. |
| Secure Boot V2 with RSA or ECC keys, 3 key digests, revocation (on v3.x use RSA; see ECDSA_DS-836 above) | Verified | `SOC_SECURE_BOOT_V2_RSA`, `SOC_SECURE_BOOT_V2_ECC`, `SOC_EFUSE_SECURE_BOOT_KEY_DIGESTS 3`, `SOC_SUPPORT_SECURE_BOOT_REVOKE_KEY` (1) |
| Flash encryption with XTS-AES-128 or -256 | Verified | `SOC_FLASH_ENCRYPTION_XTS_AES`, `SOC_FLASH_ENCRYPTION_XTS_AES_128`, `SOC_EFUSE_XTS_AES_KEY_256` (1) |
| **Key Manager hardware is present**: a hardware unique key (HUK) derived from a physically unclonable function, regenerated at every power-on and gone at power-off; keys stored as recovery information in external memory; AES, ECDH0 and ECDH1 deploy modes | Verified (as declared) | (3) §4.1.5.10 "Key Manager" |
| **ESP-IDF does not support the Key Manager yet** | Verified | (1) sets `SOC_KEY_MANAGER_SUPPORTED 0` while declaring the deploy capabilities. Firmware cannot rely on it until ESP-IDF turns it on. |
| Variant ESP32-P4NRW32X has 32 MB in-package PSRAM (OPI/HPI, 1.8 V, 16-bit DDR, up to 250 MHz, XTS-AES encryptable); ESP32-P4NRW16X has 16 MB | Verified | (3) Table 1-1 "ESP32-P4 Series Comparison" and §4.1.3.1 |
| Both variants ship as chip revision **v3.x**, and the same part number has carried several revisions | Verified | (3) Table 1-1 and §1.3. Read the board's actual revision (ESP-IDF prints it at boot) and check the *ESP32-P4 Series SoC Errata* for it. |
| JTAG can be disabled permanently (`DIS_PAD_JTAG`, `DIS_USB_JTAG`) or "softly" (`SOFT_DIS_JTAG`, re-enabled by an HMAC key) | Verified | (4): `DIS_PAD_JTAG` "disabled in the hard way(permanently)", `SOFT_DIS_JTAG`, `DIS_USB_JTAG`; (5) Security Overview: "soft disabling the JTAG interface and it can be re-enabled by programming a secret key through HMAC" |
| JTAG stays disabled once any security feature (secure boot, flash encryption) is enabled; Secure UART Download mode turns on the same way, and `DIS_DOWNLOAD_MODE` disables ROM download mode entirely | Verified | (5) Security Overview: "JTAG interface stays disabled if any of the security features are enabled"; (4): `DIS_DOWNLOAD_MODE`, `DIS_USB_SERIAL_JTAG_DOWNLOAD_MODE`, `SECURE_BOOT_EN`, `SPI_BOOT_CRYPT_CNT` |
| eFuse layout: field names, block, bit position and width | Verified | (4). Read it there; do not copy offsets into code from this file. |
| The hardware ECDSA peripheral can be forced to use a hardware-random `k` (`ECDSA_ENABLE_SOFT_K`) | Verified (as declared) | (4). Applies to the NIST-curve peripheral only; secp256k1 signing is in software (row above). |
| Power modes: Active; Light-sleep (CPU paused, L2MEM kept); Deep-sleep (CPU and L2MEM off, only LP memory on) | Verified | (3) §4.1.4.6 "Low-Power Management"; see [Memory, access and power](#memory-access-and-power) |

## Memory, access and power

From (6), checked against (7). Take addresses for code from (7) or the Rust PAC,
never from this file or the manual's tables.

| Fact | Status | Evidence |
| --- | --- | --- |
| Memory map (cached; the same memories repeat uncached `0x4000_0000` higher): external flash `0x4000_0000` and PSRAM `0x4800_0000` (64 MB windows), HP ROM `0x4FC0_0000` (128 KB), HP L2MEM `0x4FF0_0000` (768 KB). Uncached only: HP SPM `0x3010_0000` (8 KB), LP ROM `0x5010_0000` (16 KB), LP SRAM `0x5010_8000` (32 KB). | Verified | (6) Table 9.3-1; (7) `soc.h` agrees |
| The manual's peripheral table misplaces the ECC, digital-signature and HMAC blocks and misprints other ranges. ESP-IDF and the Rust SVD agree with each other, for example HMAC at `0x5009_5000`. | Verified | (6) Table 9.3-2 against (7) `reg_base.h` and (8) |
| **The LP core and the DMA masters, both USB OTG controllers included, can reach HP L2MEM, external flash and PSRAM.** Only the APM permission unit limits them, and nothing limits the LP core's access to LP SRAM. HP SPM is the one RAM neither can reach. | Verified | (6) §9.3.1, §9.3.4, Table 20.1-1 |
| **LP SRAM stays powered in every power mode, Deep-sleep included**; HP L2MEM can be kept powered in Light-sleep | Verified | (6) §15.3, §9.3.2 |
| Power domains: HP CPU, `PD_TOP` (bus, HP peripherals, ROM), six L2MEM sub-domains, `PD_HP_CNNT` (USB, SDIO), LP peripherals (with the LP core) and always-on (PMU, RTC). Deep-sleep turns off all but always-on. | Verified | (6) §15.4.1.2, Table 15.5-1 |
| For key handling: set up PMP and APM before secrets enter L2MEM or PSRAM, keep secrets out of LP SRAM, and wipe them before any sleep | Inferred | From the rows above |
| Not reviewed: PMP and APM setup, the LP TRNG block that ESP-IDF's v3 map adds at `0x5012_6000`, and whether LP SRAM keeps its data on `VDD_BAT` alone | **Unverified** | Tracked in [#21](https://github.com/cuddy-five/esp32p4/issues/21) |
