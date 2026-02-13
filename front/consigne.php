<?php
    class Consigne {

        private $pdo;

        public function __construct($pdo){
            $this->pdo = $pdo;
        }

        public function getAll(){
            return $this->pdo->query("SELECT * FROM LaSerre_Consigne")->fetchAll(PDO::FETCH_ASSOC);
        }

        public function get($id){
            $stmt = $this->pdo->prepare("SELECT * FROM LaSerre_Consigne WHERE id=?");
            $stmt->execute([$id]);
            return $stmt->fetch(PDO::FETCH_ASSOC);
        }

        public function create($data){
            $sql = "INSERT INTO LaSerre_Consigne (temperature, humidite_moyenne, humidite_air, relai_0, relai_1, relai_2, relai_3, utilisateur_id)
                    VALUES (:temperature, :humidite_moyenne, :humidite_air, :relai_0, :relai_1, :relai_2, :relai_3, :utilisateur_id)";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($data);
            return $this->pdo->lastInsertId();
        }

        public function update($id, $data){
            $sql = "UPDATE LaSerre_Consigne SET 
                    temperature=:temperature, humidite_moyenne=:humidite_moyenne, humidite_air=:humidite_air,
                    relai_0=:relai_0, relai_1=:relai_1, relai_2=:relai_2, relai_3=:relai_3,
                    utilisateur_id=:utilisateur_id
                    WHERE id=:id";
            $data['id'] = $id;
            return $this->pdo->prepare($sql)->execute($data);
        }

        public function delete($id){
            return $this->pdo->prepare("DELETE FROM LaSerre_Consigne WHERE id=?")->execute([$id]);
        }
    }
?>