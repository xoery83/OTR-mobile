import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type FoundationScreenProps = {
  title: string;
  status: string;
};

export function FoundationScreen({ title, status }: FoundationScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>{status}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  eyebrow: {
    color: "#0F766E",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  title: {
    color: "#0F172A",
    fontSize: 34,
    fontWeight: "800",
  },
});
