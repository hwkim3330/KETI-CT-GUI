#!/usr/bin/env python3
"""Capture serial frames to compare with our implementation"""

import serial
import time
import sys

def main():
    port = '/dev/ttyACM0'

    # Open serial port in read-only mode
    ser = serial.Serial(port, 115200, timeout=1)

    print(f"Listening on {port}...")
    print("Run mup1cc in another terminal")
    print("-" * 60)

    try:
        while True:
            if ser.in_waiting > 0:
                data = ser.read(ser.in_waiting)
                hex_str = data.hex()
                print(f"RX ({len(data)} bytes): {hex_str}")

                # Try to parse as MUP1
                if data[0:1] == b'>':
                    print(f"  -> MUP1 frame detected")

    except KeyboardInterrupt:
        print("\nStopped")
    finally:
        ser.close()

if __name__ == '__main__':
    main()
