package main

import "fmt"
import "log"
import "time"
import "sync"
import "strings"
import "github.com/go-redis/redis"

func main() {
	client := redis.NewClient(&redis.Options{
		Addr:     "apt:31500",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	var n int
	log.Println("Scanning entry types...")

	typeKeySets := make(chan []string, 5)

	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			log.Println("Have", n, "entries, queue len", len(typeKeySets))
		}
	}()

	go func() {
		defer close(typeKeySets)

		var cursor uint64
		var hasMore bool = true
		for hasMore {
			var keys []string
			var err error
			keys, cursor, err = client.Scan(cursor, "sdns:nodes/*:type", 200).Result()
			if err != nil {
				panic(err)
			}

			n += len(keys)
			typeKeySets <- keys
			hasMore = cursor != 0
		}
	}()

	var wg sync.WaitGroup
	var outMutex sync.Mutex
	readSets := func() {
		defer wg.Done()
		for keys := range typeKeySets {
			values := client.MGet(keys...).Val()
			if len(keys) != len(values) {
				log.Println(keys)
				log.Println(values)
				panic("types MGET bugged!")
			}

			nameKeys := make([]string, len(keys))
			for idx, typeKey := range keys {
				nameKeys[idx] = strings.TrimSuffix(typeKey, ":type") + ":name"
			}
			names := client.MGet(nameKeys...).Val()
			if len(nameKeys) != len(names) {
				log.Println(nameKeys)
				log.Println(names)
				panic("names MGET bugged!")
			}

			outMutex.Lock()
			for idx, key := range keys {
				nodeId := strings.Split(strings.Split(key, "/")[1], ":")[0]
				fmt.Printf("%s\t%s\t%s\n", nodeId, values[idx].(string), names[idx])
			}
			outMutex.Unlock()
		}
	}

	wg.Add(4)
	go readSets()
	go readSets()
	go readSets()
	go readSets()
	wg.Wait()

	log.Printf("done! found found %d entry types\n", n)
}
