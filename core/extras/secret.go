package extras

import (
	"crypto/rand"
	"encoding/base64"
	//"encoding/hex"
	"fmt"
)

func GenerateSecret() string {
	bytes := make([]byte, 32)

	_, err := rand.Read(bytes)
	if err != nil {
		fmt.Println("secret generation error:", err)
		return "error" // TODO
	}

	return base64.StdEncoding.EncodeToString(bytes)
}

func GenerateId() string {
	bytes := make([]byte, 9)

	_, err := rand.Read(bytes)
	if err != nil {
		fmt.Println("secret generation error:", err)
		return "error" // TODO
	}

	//return hex.EncodeToString(bytes)
	return base64.StdEncoding.EncodeToString(bytes)
}
