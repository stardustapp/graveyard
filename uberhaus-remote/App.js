// Exported from snack.expo.io
import React, { Component } from 'react';
import { Text, View, StyleSheet, Image, TouchableOpacity, ListView } from 'react-native';
import { Constants } from 'expo';
import Skylink from './skylink';

const skylinkP = Skylink.openChart('wss://devmode.cloud', 'uberhaus');
var skylink = null;
skylinkP.then(x => skylink = x);

export default class App extends Component {
  constructor() {
    super();

    const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});
    this.state = {
      dataSource: ds,
    };

    skylinkP
      .then(sl => sl.enumerate('/rpi', {
        maxDepth: 1,
        includeRoot: false,
      }))
      .then(x => {
        this.setState({
          dataSource: ds.cloneWithRows(
            x.map(y => ({name: y.Name, id: y.Name}))),
        });
      });
  }

  renderDeviceRow(d) {
    return (
      <View style={styles.deviceRow}>
        <TouchableOpacity
          onPress={() => skylink.invoke('/rpi/'+d.id+'/off')}>
          <Image
            source={{ uri: 'https://i.imgur.com/yt5fp0N.png' }}
            style={{ height: 100, width: 70 }}
          />
        </TouchableOpacity>
        <Text style={styles.deviceLabel}>
          {d.name}
        </Text>
        <TouchableOpacity
          onPress={() => skylink.invoke('/rpi/'+d.id+'/on')}>
          <Image
            source={{ uri: 'https://i.imgur.com/uk6LtB3.png' }}
            style={{ height: 100, width: 70 }}
          />
        </TouchableOpacity>
      </View>
    );
  }

  render() {
    return (
      <View style={styles.container}>
        <Text style={styles.roomLabel}>
          3662 Midvale
        </Text>
        <ListView
          dataSource={this.state.dataSource}
          renderRow={this.renderDeviceRow}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Constants.statusBarHeight,
    backgroundColor: '#ecf0f1',
  },
  roomLabel: {
    margin: 24,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#34495e',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceLabel: {
    margin: 24,
    fontSize: 18,
    textAlign: 'center',
    color: '#34495e',
    width: 100,
  },
});
