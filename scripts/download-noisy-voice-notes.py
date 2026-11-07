#!/usr/bin/env python3
"""
Download real-world noisy voice notes from Hugging Face (danielrosehill/Noisy-Voice-Notes)
and convert them to 48 kHz Mono 16-bit PCM WAV files for SecureVoice pipeline benchmarking.
"""

import os
import sys
import urllib.request
import miniaudio
import wave

BASE_URL = "https://huggingface.co/datasets/danielrosehill/Noisy-Voice-Notes/resolve/main/audio"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "../test-data/noisy-voice-notes")

CLIPS = [
    {
        "id": "VIIf31b1",
        "filename": "VIIf31b1.mp3",
        "description": "Adding hardware to homebox inventory (Noise level 5/5, loud background noise)",
        "duration_s": 39.85
    },
    {
        "id": "jdda3ryL",
        "filename": "jdda3ryL.mp3",
        "description": "Actionable voicenote organiser platform idea (Noise level 1/5, fast conversational speech)",
        "duration_s": 23.5
    }
]

def download_and_convert():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    for clip in CLIPS:
        mp3_path = os.path.join(OUTPUT_DIR, clip["filename"])
        wav_path = os.path.join(OUTPUT_DIR, f"{clip['id']}_48k.wav")
        url = f"{BASE_URL}/{clip['filename']}"
        
        if not os.path.exists(mp3_path):
            print(f"📥 Downloading {clip['filename']} ({clip['description']})...")
            urllib.request.urlretrieve(url, mp3_path)
            size_kb = os.path.getsize(mp3_path) / 1024
            print(f"  ✓ Downloaded {size_kb:.1f} KB")
        else:
            print(f"✓ Cached: {clip['filename']}")
            
        print(f"🔄 Decoding {clip['filename']} -> 48 kHz Mono 16-bit PCM WAV...")
        decoded = miniaudio.decode_file(
            mp3_path,
            output_format=miniaudio.SampleFormat.SIGNED16,
            nchannels=1,
            sample_rate=48000
        )
        
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2) # 16-bit
            wf.setframerate(48000)
            wf.writeframes(decoded.samples)
            
        num_samples = len(decoded.samples) // 2
        duration_s = num_samples / 48000.0
        wav_kb = os.path.getsize(wav_path) / 1024
        print(f"  ✓ Written {wav_path} ({duration_s:.1f}s, {wav_kb:.1f} KB, {num_samples} samples)")

    print("\n✅ Dataset ingestion and 48 kHz decoding complete.")

if __name__ == "__main__":
    download_and_convert()
