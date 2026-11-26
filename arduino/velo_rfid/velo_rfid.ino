/*
  Velo - Arduino RFID reader

  Reads MIFARE cards with an RC522 module and prints each UID over USB serial:
      RFID:04A1B2C3
  The ground station reads those lines and calls the cloud API. It answers with:
      ACK:RENT:<bike>    -> green LED + short beep (open the lock here)
      ACK:RETURN:<bike>  -> green LED + two beeps
      ERR:<reason>       -> red LED + long beep

  Wiring (Arduino Uno -> RC522):
      SDA 10 | SCK 13 | MOSI 11 | MISO 12 | RST 9 | 3.3V | GND
  LEDs / buzzer:  green 4, red 5, buzzer 6.

  Library: "MFRC522" by GithubCommunity (Library Manager).
*/
#include <SPI.h>
#include <MFRC522.h>

const uint8_t SS_PIN = 10;
const uint8_t RST_PIN = 9;
const uint8_t GREEN_LED = 4;
const uint8_t RED_LED = 5;
const uint8_t BUZZER = 6;

MFRC522 reader(SS_PIN, RST_PIN);
String reply = "";

void beep(unsigned int ms) {
  digitalWrite(BUZZER, HIGH);
  delay(ms);
  digitalWrite(BUZZER, LOW);
}

void signal(bool ok, uint8_t beeps, unsigned int ms) {
  digitalWrite(ok ? GREEN_LED : RED_LED, HIGH);
  for (uint8_t i = 0; i < beeps; i++) {
    beep(ms);
    delay(80);
  }
  delay(400);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
}

void handleReply(const String &line) {
  if (line.startsWith("ACK:RENT")) signal(true, 1, 120);
  else if (line.startsWith("ACK:RETURN")) signal(true, 2, 120);
  else if (line.startsWith("ERR:")) signal(false, 1, 600);
}

void setup() {
  Serial.begin(9600);
  SPI.begin();
  reader.PCD_Init();
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  Serial.println("READY");
}

void loop() {
  // Result coming back from the ground station
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      reply.trim();
      handleReply(reply);
      reply = "";
    } else {
      reply += c;
    }
  }

  // New card on the reader
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return;

  Serial.print("RFID:");
  for (byte i = 0; i < reader.uid.size; i++) {
    if (reader.uid.uidByte[i] < 0x10) Serial.print("0");
    Serial.print(reader.uid.uidByte[i], HEX);
  }
  Serial.println();

  reader.PICC_HaltA();
  reader.PCD_StopCrypto1();
  delay(300);
}
