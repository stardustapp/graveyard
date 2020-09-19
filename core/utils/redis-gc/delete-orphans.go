package main

import (
	"bufio"
	"io"
	"log"
	"os"
	"strings"
	"time"
)
import "github.com/go-redis/redis"

func main() {
	client := redis.NewClient(&redis.Options{
		Addr:     "apt:31500",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	var n int
  var deletedKeys int64

	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			log.Println("Progress: deleted", deletedKeys, "keys, via", n, "orphans (dryrun)")
		}
	}()

	f, err := os.Open("orphans.tsv")
	defer f.Close()
	if err != nil {
		log.Fatal(err)
	}

	rd := bufio.NewReader(f)
	log.Println("Reading orphans file...")
	stillAlive := true
	for stillAlive {
		line, err := rd.ReadString('\n')
		if err == io.EOF {
			stillAlive = false
		} else if err != nil {
			log.Fatal(err)
		}

		nid := strings.TrimSuffix(line, "\n")
		if nid == "" {
			break
		}

		prefix := "TODOREMOVE:sdns:nodes/" + nid + ":"
		deletedKeys += client.Del(
			prefix+"type",
			prefix+"name",
			prefix+"children",
			prefix+"value",
			prefix+"target",
			prefix+"raw-data").Val()
		n++
	}
	log.Println("Done deleting", deletedKeys, "redis keys, via", n, "orphans (dryrun)")
}
