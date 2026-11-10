//! A read-only view of a serialized Bitcoin transaction.
//!
//! [`Tx::parse`] checks the whole structure once and keeps references into the
//! caller's bytes; nothing is copied or allocated. The input is treated as
//! hostile: every read is bounds-checked and a malformed transaction is an
//! error, never a panic.
//!
//! Only the original serialization without witness data is accepted. That is
//! the form BIP174 requires for the unsigned transaction inside a PSBT, and a
//! signer needs no other.

/// The largest length a compact size may declare (`MAX_SIZE` in Bitcoin).
const MAX_SIZE: u64 = 0x0200_0000;

/// Why a byte string is not an acceptable transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TxError {
    /// The bytes end before the structure does.
    Truncated,
    /// A length is not written in its shortest form.
    NonCanonicalSize,
    /// A length is larger than Bitcoin allows.
    OversizedLength,
    /// The input count is zero. This is also how a witness serialization
    /// begins, which this parser does not accept.
    NoInputsOrWitnessFormat,
    /// Bytes remain after the lock time.
    TrailingBytes,
}

impl core::fmt::Display for TxError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(match self {
            Self::Truncated => "transaction is truncated",
            Self::NonCanonicalSize => "a length is not in its shortest form",
            Self::OversizedLength => "a length is larger than Bitcoin allows",
            Self::NoInputsOrWitnessFormat => "no inputs, or a witness serialization",
            Self::TrailingBytes => "bytes remain after the transaction",
        })
    }
}

impl core::error::Error for TxError {}

/// Hands out bytes from the front of a slice, never past its end.
#[derive(Clone)]
struct Reader<'a> {
    rest: &'a [u8],
}

impl<'a> Reader<'a> {
    fn take(&mut self, n: usize) -> Result<&'a [u8], TxError> {
        let (head, tail) = self.rest.split_at_checked(n).ok_or(TxError::Truncated)?;
        self.rest = tail;
        Ok(head)
    }

    fn array<const N: usize>(&mut self) -> Result<&'a [u8; N], TxError> {
        self.take(N)?.try_into().map_err(|_| TxError::Truncated)
    }

    /// Reads Bitcoin's variable-length integer, refusing any encoding that is
    /// longer than necessary or larger than [`MAX_SIZE`].
    fn compact_size(&mut self) -> Result<u64, TxError> {
        let [first] = *self.array::<1>()?;
        let (value, smallest_allowed) = match first {
            0xfd => (u64::from(u16::from_le_bytes(*self.array()?)), 0xfd),
            0xfe => (u64::from(u32::from_le_bytes(*self.array()?)), 0x1_0000),
            0xff => (u64::from_le_bytes(*self.array()?), 0x1_0000_0000),
            small => (u64::from(small), 0),
        };
        if value < smallest_allowed {
            return Err(TxError::NonCanonicalSize);
        }
        if value > MAX_SIZE {
            return Err(TxError::OversizedLength);
        }
        Ok(value)
    }

    fn length_prefixed(&mut self) -> Result<&'a [u8], TxError> {
        let len = usize::try_from(self.compact_size()?).map_err(|_| TxError::OversizedLength)?;
        self.take(len)
    }

    fn input(&mut self) -> Result<Input<'a>, TxError> {
        Ok(Input {
            outpoint: self.array()?,
            script_sig: self.length_prefixed()?,
            sequence: self.array()?,
        })
    }

    fn output(&mut self) -> Result<Output<'a>, TxError> {
        let before = self.rest;
        let value = self.array()?;
        let script_pubkey = self.length_prefixed()?;
        Ok(Output {
            value,
            script_pubkey,
            serialized: consumed(before, self.rest)?,
        })
    }
}

/// The part of `before` that was read to reach `after`.
fn consumed<'a>(before: &'a [u8], after: &[u8]) -> Result<&'a [u8], TxError> {
    let len = before
        .len()
        .checked_sub(after.len())
        .ok_or(TxError::Truncated)?;
    before.get(..len).ok_or(TxError::Truncated)
}

/// One transaction input.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Input<'a> {
    /// The output being spent: 32-byte transaction id, then its 4-byte index.
    pub outpoint: &'a [u8; 36],
    /// The unlocking script. Empty in an unsigned transaction.
    pub script_sig: &'a [u8],
    /// The sequence number, little endian.
    pub sequence: &'a [u8; 4],
}

/// One transaction output.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Output<'a> {
    value: &'a [u8; 8],
    /// The locking script.
    pub script_pubkey: &'a [u8],
    serialized: &'a [u8],
}

impl<'a> Output<'a> {
    /// The amount in satoshis.
    #[must_use]
    pub fn amount(&self) -> u64 {
        u64::from_le_bytes(*self.value)
    }

    /// The output exactly as the transaction serializes it.
    #[must_use]
    pub fn serialized(&self) -> &'a [u8] {
        self.serialized
    }
}

/// A checked, read-only view of a serialized transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tx<'a> {
    version: &'a [u8; 4],
    inputs: &'a [u8],
    input_count: usize,
    outputs: &'a [u8],
    output_count: usize,
    lock_time: &'a [u8; 4],
}

impl<'a> Tx<'a> {
    /// Checks that `bytes` is exactly one transaction and returns a view of it.
    ///
    /// # Errors
    ///
    /// Returns a [`TxError`] when the bytes are truncated, carry a length that
    /// is too large or not in its shortest form, have no inputs or use the
    /// witness serialization, or continue after the lock time.
    pub fn parse(bytes: &'a [u8]) -> Result<Self, TxError> {
        let mut reader = Reader { rest: bytes };
        let version = reader.array()?;

        let declared_inputs = reader.compact_size()?;
        if declared_inputs == 0 {
            return Err(TxError::NoInputsOrWitnessFormat);
        }
        let inputs_start = reader.rest;
        for _ in 0..declared_inputs {
            reader.input()?;
        }
        let inputs = consumed(inputs_start, reader.rest)?;

        let declared_outputs = reader.compact_size()?;
        let outputs_start = reader.rest;
        for _ in 0..declared_outputs {
            reader.output()?;
        }
        let outputs = consumed(outputs_start, reader.rest)?;

        let lock_time = reader.array()?;
        if !reader.rest.is_empty() {
            return Err(TxError::TrailingBytes);
        }
        Ok(Self {
            version,
            inputs,
            input_count: usize::try_from(declared_inputs).map_err(|_| TxError::OversizedLength)?,
            outputs,
            output_count: usize::try_from(declared_outputs)
                .map_err(|_| TxError::OversizedLength)?,
            lock_time,
        })
    }

    /// The version field, little endian.
    #[must_use]
    pub fn version(&self) -> &'a [u8; 4] {
        self.version
    }

    /// The lock time field, little endian.
    #[must_use]
    pub fn lock_time(&self) -> &'a [u8; 4] {
        self.lock_time
    }

    /// How many inputs the transaction has. Never zero.
    #[must_use]
    pub fn input_count(&self) -> usize {
        self.input_count
    }

    /// How many outputs the transaction has.
    #[must_use]
    pub fn output_count(&self) -> usize {
        self.output_count
    }

    /// The inputs, in order.
    #[must_use]
    pub fn inputs(&self) -> Inputs<'a> {
        Inputs {
            reader: Reader { rest: self.inputs },
            remaining: self.input_count,
        }
    }

    /// The outputs, in order.
    #[must_use]
    pub fn outputs(&self) -> Outputs<'a> {
        Outputs {
            reader: Reader { rest: self.outputs },
            remaining: self.output_count,
        }
    }

    /// Every output as serialized, back to back, without the count.
    #[must_use]
    pub fn serialized_outputs(&self) -> &'a [u8] {
        self.outputs
    }
}

/// Iterator over a transaction's inputs.
#[derive(Clone)]
pub struct Inputs<'a> {
    reader: Reader<'a>,
    remaining: usize,
}

impl<'a> Iterator for Inputs<'a> {
    type Item = Input<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        self.remaining = self.remaining.checked_sub(1)?;
        // `Tx::parse` already read these bytes, so this cannot fail.
        self.reader.input().ok()
    }
}

/// Iterator over a transaction's outputs.
#[derive(Clone)]
pub struct Outputs<'a> {
    reader: Reader<'a>,
    remaining: usize,
}

impl<'a> Iterator for Outputs<'a> {
    type Item = Output<'a>;

    fn next(&mut self) -> Option<Self::Item> {
        self.remaining = self.remaining.checked_sub(1)?;
        // `Tx::parse` already read these bytes, so this cannot fail.
        self.reader.output().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::{Reader, TxError};

    fn read(bytes: &[u8]) -> Result<u64, TxError> {
        Reader { rest: bytes }.compact_size()
    }

    #[test]
    fn compact_size_accepts_only_the_shortest_form() {
        assert_eq!(read(&[0x00]), Ok(0));
        assert_eq!(read(&[0xfc]), Ok(0xfc));
        assert_eq!(read(&[0xfd, 0xfd, 0x00]), Ok(0xfd));
        assert_eq!(read(&[0xfd, 0xff, 0xff]), Ok(0xffff));
        assert_eq!(read(&[0xfe, 0x00, 0x00, 0x01, 0x00]), Ok(0x1_0000));
        assert_eq!(read(&[0xfe, 0x00, 0x00, 0x00, 0x02]), Ok(0x0200_0000));

        assert_eq!(read(&[0xfd, 0xfc, 0x00]), Err(TxError::NonCanonicalSize));
        assert_eq!(
            read(&[0xfe, 0xff, 0xff, 0x00, 0x00]),
            Err(TxError::NonCanonicalSize)
        );
        assert_eq!(
            read(&[0xff, 0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0]),
            Err(TxError::NonCanonicalSize)
        );
    }

    #[test]
    fn compact_size_refuses_oversized_and_truncated_values() {
        assert_eq!(
            read(&[0xfe, 0x01, 0x00, 0x00, 0x02]),
            Err(TxError::OversizedLength)
        );
        assert_eq!(
            read(&[0xff, 0, 0, 0, 0, 1, 0, 0, 0]),
            Err(TxError::OversizedLength)
        );
        assert_eq!(read(&[]), Err(TxError::Truncated));
        assert_eq!(read(&[0xfd, 0x00]), Err(TxError::Truncated));
        assert_eq!(read(&[0xff, 0, 0, 0]), Err(TxError::Truncated));
    }
}
