package main

func (c *Client) Welcome() {
	c.SendServerMessage("001", "danopia", "Welcome to the devmode.cloud Internet Relay Chat Headend danopia")
	c.SendServerMessage("002", "danopia", "Your host is irc.devmode.cloud[irc.devmode.cloud/6667], running network-bouncer.go")
	c.SendServerMessage("003", "danopia", "This server was created Wed Feb 17 22:23:45 UTC 2016")
	c.SendServerMessage("004", "danopia", "irc.devmode.cloud", "stardust-irc-3.5.0", "DQRSZagiloswz", "CFILPQbcefgijklmnopqrstvz", "bkloveqjfI")
	c.SendServerMessage("005", "danopia", "CPRIVMSG", "CNOTICE", "WHOX", "ETRACE", "MONITOR=100", "SAFELIST", "ELIST=CTU", "KNOCK", "FNC", "CHANTYPES=&#", "EXCEPTS", "INVEX", "are supported by this server")
	c.SendServerMessage("005", "danopia", "CHANMODES=eIbq,k,flj,CFLPQcgimnprstz", "CHANLIMIT=&#:15", "PREFIX=(ov)@+", "MAXLIST=bqeI:100", "MODES=4", "NETWORK=Stardust", "STATUSMSG=@+", "CALLERID=g", "CASEMAPPING=rfc1459", "NICKLEN=30", "MAXNICKLEN=31", "CHANNELLEN=50", "are supported by this server")
	c.SendServerMessage("005", "danopia", "TOPICLEN=390", "DEAF=D", "TARGMAX=NAMES:1,LIST:1,KICK:1,WHOIS:1,PRIVMSG:4,NOTICE:4,ACCEPT:,MONITOR:", "CLIENTVER=3.0", "are supported by this server")
	//c.SendServerMessage("251", "danopia", "There are 0 users and 1 invisible on 1 servers")
	//c.SendServerMessage("255", "danopia", "I have 1 clients and 0 servers")
	//c.SendServerMessage("265", "danopia", "1", "1", "Current local users 1, max 1")
	//c.SendServerMessage("266", "danopia", "1", "1", "Current global users 1, max 1")
	//c.SendServerMessage("250", "danopia", "Highest connection count: 1 (1 clients) (1 netConnections received)")
	c.SendServerMessage("375", "danopia", "- irc.devmode.cloud Message of the Day -")
	c.SendServerMessage("372", "danopia", "- Thank you for your attention.")
	c.SendServerMessage("376", "danopia", "End of /MOTD command.")
}
