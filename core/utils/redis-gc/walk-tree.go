package main

import (
	"fmt"
	"log"
	"time"
)
import "github.com/go-redis/redis"

func main() {
	client := redis.NewClient(&redis.Options{
		Addr:     "apt:31500",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	var foundNodes int = 1

	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		for range ticker.C {
			log.Println("Seen", foundNodes, "nodes")
		}
	}()

	var printTree func(nid string, depth int)
	printTree = func(nid string, depth int) {
		resp := client.HGetAll("sdns:nodes/" + nid + ":children")
		for name, childNid := range resp.Val() {
			fmt.Printf("%v\t%s\t%s\n", depth, childNid, name)
			foundNodes++
			printTree(childNid, depth+1)
		}
	}

	var rootNid string = client.Get("sdns:root").Val()
	fmt.Printf("%v\t%s\t%s\n", 0, rootNid, "/")
	printTree(rootNid, 1)

	log.Println("Finished walking", foundNodes, "nodes")
}
